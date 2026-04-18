import { RedisService } from '@liaoliaots/nestjs-redis';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { AppException } from '../../common/exception/app.exception';
import { USER_ROLE } from '../../domains/user/const/userRole';
import { UserInfoDto } from '../../domains/user/dto/userInfo.dto';
import { User } from '../../domains/user/entity/user.entity';
import { CommonErrorCode } from '../../domains/user/exception/user-error-code';
import { AUTH_EXPIRE_TIME } from '../const/authExpireTime.const';
import { USER_STATUS } from '../const/userStatus.const';
import { AuthErrorCode } from '../exception/auth-error-code';

@Injectable()
export class AuthService {
  private readonly redis: Redis | null;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private redisService: RedisService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @Optional() @Inject() private readonly eventEmitter?: EventEmitter2,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  private parseSessionData(sessionData: string | null) {
    if (!sessionData) {
      return null;
    }

    try {
      return JSON.parse(sessionData);
    } catch (error) {
      this.logger.warn(`Invalid session format: ${error instanceof Error ? error.message : 'unknown error'}`);
      return null;
    }
  }

  private async getParsedSession(sid: string) {
    return this.parseSessionData(await this.redis.get(`user:${sid}`));
  }

  async getUserIdFromSession(sid: string): Promise<[number | null, string | null]> {
    const session = await this.getParsedSession(sid);
    if (!session) return [null, null];
    const userId = session.id;
    const userLoginId = session.loginId;
    if (!userId || !userLoginId) return [null, null];
    return [userId, userLoginId];
  }

  async setUserStatusLogin(sid: string) {
    const session = await this.getParsedSession(sid);
    if (!session) return;
    if (session.userStatus === USER_STATUS.ADMIN) return;

    await this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.LOGIN }));
  }

  async setUserStatusWaiting(sid: string) {
    const session = await this.getParsedSession(sid);
    if (!session) return;
    if (session.userStatus === USER_STATUS.ADMIN) return;

    await this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.WAITING }));
  }

  async setUserStatusEntering(sid: string) {
    const session = await this.getParsedSession(sid);
    if (!session) return;
    if (session.userStatus === USER_STATUS.ADMIN) return;

    await this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.ENTERING }));
  }

  async setUserStatusSelectingSeat(sid: string) {
    const session = await this.getParsedSession(sid);
    if (!session) return;
    if (session.userStatus === USER_STATUS.ADMIN) return;

    await this.redis.set(
      `user:${sid}`,
      JSON.stringify({ ...session, userStatus: USER_STATUS.SELECTING_SEAT }),
    );
  }

  async setUserStatusReconnectingSelecting(sid: string) {
    const session = await this.getParsedSession(sid);
    if (!session) return;
    if (session.userStatus === USER_STATUS.ADMIN) return;

    await this.redis.set(
      `user:${sid}`,
      JSON.stringify({ ...session, userStatus: USER_STATUS.RECONNECTING_SELECTING }),
    );
  }

  async setUserStatusAdmin(sid: string) {
    const session = await this.getParsedSession(sid);
    if (!session) return;

    await this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.ADMIN }));
  }

  async removeSession(sid: string, loginId: string) {
    this.redis.unlink(`user-id:${loginId}`);
    return this.redis.unlink(`user:${sid}`);
  }

  async validateUser(id: string, password: string) {
    try {
      const keyOfUserId = `user-id:${id}`;
      const oldSessionId = await this.redis.get(keyOfUserId);

      if (oldSessionId) {
        await this.redis.unlink(`user:${oldSessionId}`);
      }

      const user = await this.userRepository.findOne({ where: { loginId: id } });
      if (!user) {
        throw new AppException(AuthErrorCode.INVALID_CREDENTIALS);
      }

      const checkPasswordValid = await bcrypt.compare(password, user.loginPassword);
      if (!checkPasswordValid) {
        throw new AppException(AuthErrorCode.INVALID_CREDENTIALS);
      }

      const cachedUserInfo = {
        id: user.id,
        loginId: user.loginId,
        userStatus: user.role === USER_ROLE.ADMIN ? USER_STATUS.ADMIN : USER_STATUS.LOGIN,
        targetEvent: null,
      };

      const sessionId = uuidv4();
      const userInfoDto: UserInfoDto = new UserInfoDto();
      userInfoDto.loginId = user.loginId;

      await this.redis.set(`user-id:${id}`, sessionId, 'EX', AUTH_EXPIRE_TIME);
      await this.redis.set(`user:${sessionId}`, JSON.stringify(cachedUserInfo), 'EX', AUTH_EXPIRE_TIME);

      return { sessionId: sessionId, userInfo: userInfoDto };
    } catch (err) {
      if (err instanceof AppException) {
        throw err;
      }
      throw new AppException(CommonErrorCode.INTERNAL_SERVER_ERROR);
    }
  }

  async getUserInfo(sid: string) {
    try {
      const userInfo = await this.getUserSession(sid);
      const userInfoDto: UserInfoDto = new UserInfoDto();
      userInfoDto.loginId = userInfo.loginId;
      return userInfoDto;
    } catch (err) {
      this.logger.error(err);
      throw new AppException(AuthErrorCode.USER_INFO_FETCH_FAILED);
    }
  }

  async logoutUser(sid: string, loginId: string) {
    try {
      const sessionData = await this.redis.get(`user:${sid}`);
      if (sessionData) {
        this.eventEmitter?.emit('logout-start', { sid, sessionData });
        if ((await this.removeSession(sid, loginId)) > 0) {
          return { message: '로그아웃 하였습니다.' };
        }
      } else {
        this.logger.warn(`세션 없는 로그아웃 요청: SID=${sid}, loginId=${loginId}`);
        return { message: '로그아웃 하였습니다.' };
      }
    } catch (err) {
      this.logger.error(err);
      throw new AppException(AuthErrorCode.LOGOUT_FAILED);
    }
  }

  async setUserEventTarget(sid: string, eventId: number) {
    const session = await this.getParsedSession(sid);
    if (!session) {
      return;
    }

    await this.redis.set(`user:${sid}`, JSON.stringify({ ...session, targetEvent: eventId }));
  }

  async getUserEventTarget(sid: string) {
    const session = await this.getParsedSession(sid);
    if (!session) {
      return null;
    }

    return session?.targetEvent ?? null;
  }

  async makeGuestUser() {
    try {
      const uuid = uuidv4();
      const guestId = `guest-${uuid}`;

      const guestInfo = await this.userRepository.save({
        loginId: guestId,
        role: USER_ROLE.USER,
        checkGuest: true,
      });

      const guestSession = {
        id: guestInfo.id,
        loginId: guestInfo.loginId,
        userStatus: USER_STATUS.LOGIN,
        targetEvent: null,
      };

      await this.redis.set(`user-id:${guestId}`, uuid, 'EX', AUTH_EXPIRE_TIME);
      await this.redis.set(`user:${uuid}`, JSON.stringify(guestSession), 'EX', AUTH_EXPIRE_TIME);

      return { sessionId: uuid, userInfo: guestSession };
    } catch (err) {
      this.logger.error(err);
      throw new AppException(AuthErrorCode.GUEST_CREATE_FAILED);
    }
  }

  async getUserSession(sid: string) {
    return this.getParsedSession(sid);
  }
}
