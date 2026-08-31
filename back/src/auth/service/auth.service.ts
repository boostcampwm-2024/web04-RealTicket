import { RedisService } from '@liaoliaots/nestjs-redis';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Logger as WinstonLogger } from 'winston';

import { AppException } from '../../common/exception/app.exception';
import { USER_ROLE } from '../../domains/user/const/userRole';
import { UserInfoDto } from '../../domains/user/dto/userInfo.dto';
import { User } from '../../domains/user/entity/user.entity';
import { AUTH_EXPIRE_TIME } from '../const/authExpireTime.const';
import { USER_STATUS } from '../const/userStatus.const';
import { AuthErrorCode } from '../exception/auth-error-code';
import {
  buildLuaUserStateTransitionInput,
  type LuaUserStateTransitionResult,
  type TargetEventPatch,
} from '../fsm/user-state-transition.contract';
import {
  type SessionUserStatus,
  type TransitionResult,
  type UserStateTransitionAction,
} from '../fsm/user-state.fsm';
import { runUserStateTransitionLua } from '../luaScripts/userStateTransitionLua';

type UserSessionRecord = Record<string, unknown> & { targetEvent?: unknown; userStatus?: unknown };

type TransitionOptions = {
  skipExpectedFromCheck?: boolean;
};
type SemanticTransitionResult = TransitionResult | LuaUserStateTransitionResult | null;

@Injectable()
export class AuthService {
  private readonly redis: Redis;

  constructor(
    private redisService: RedisService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
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

  private buildTargetEventPatch(targetEvent?: number | null): TargetEventPatch {
    if (targetEvent === undefined) {
      return { mode: 'preserve' };
    }

    if (targetEvent === null) {
      return { mode: 'clear' };
    }

    return { mode: 'set', eventId: targetEvent };
  }

  private buildSessionRoles(role: string) {
    return role === USER_ROLE.ADMIN ? [USER_ROLE.USER, USER_ROLE.ADMIN] : [USER_ROLE.USER];
  }

  private getSessionUserStatus(session: UserSessionRecord): SessionUserStatus | string {
    return typeof session.userStatus === 'string' ? session.userStatus : String(session.userStatus);
  }

  private getSessionTargetEvent(session: UserSessionRecord): number | null {
    return typeof session.targetEvent === 'number' ? session.targetEvent : null;
  }

  private buildExpectedTargetEvent(
    session: UserSessionRecord,
    targetEventPatch: TargetEventPatch,
  ): number | null {
    if (targetEventPatch.mode === 'set') {
      return this.getSessionUserStatus(session) === USER_STATUS.LOGIN ? null : targetEventPatch.eventId;
    }

    return this.getSessionTargetEvent(session);
  }

  private async runLuaBackedUserStateTransition(
    sid: string,
    action: UserStateTransitionAction,
    targetEventPatch: TargetEventPatch,
    options?: Pick<TransitionOptions, 'skipExpectedFromCheck'>,
  ): Promise<SemanticTransitionResult> {
    const session = (await this.getParsedSession(sid)) as UserSessionRecord | null;
    if (!session) {
      return null;
    }

    const expectedFrom = options?.skipExpectedFromCheck ? undefined : this.getSessionUserStatus(session);
    const inputOrResult = buildLuaUserStateTransitionInput({
      sid,
      action,
      expectedFrom,
      targetEventPatch,
      expectedTargetEvent: this.buildExpectedTargetEvent(session, targetEventPatch),
    });

    if ('ok' in inputOrResult) {
      return inputOrResult;
    }

    try {
      return await runUserStateTransitionLua(this.redis, inputOrResult);
    } catch (error) {
      this.logger.error(
        `Redis Lua user state transition failed during ${action}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      throw error;
    }
  }

  async resetToLogin(sid: string, targetEvent?: number | null, options?: TransitionOptions) {
    return this.runLuaBackedUserStateTransition(
      sid,
      'resetToLogin',
      this.buildTargetEventPatch(targetEvent),
      options,
    );
  }

  async getUserIdFromSession(sid: string): Promise<[number | null, string | null]> {
    const session = await this.getParsedSession(sid);
    if (!session) return [null, null];
    const userId = session.id;
    const userLoginId = session.loginId;
    if (!userId || !userLoginId) return [null, null];
    return [userId, userLoginId];
  }

  async removeSession(sid: string, loginId: string) {
    await this.redis.unlink(`user-id:${loginId}`);
    await this.redis.zrem('sessions:active', loginId);
    return this.redis.unlink(`user:${sid}`);
  }

  async validateUser(id: string, password: string) {
    try {
      const keyOfUserId = `user-id:${id}`;
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
        userStatus: USER_STATUS.LOGIN,
        roles: this.buildSessionRoles(user.role),
        targetEvent: null,
      };

      const sessionId = uuidv4();
      const userInfoDto: UserInfoDto = new UserInfoDto();
      userInfoDto.loginId = user.loginId;

      const oldSessionId = await this.redis.get(keyOfUserId);
      await this.redis.set(`user-id:${id}`, sessionId, 'EX', AUTH_EXPIRE_TIME);
      await this.redis.set(`user:${sessionId}`, JSON.stringify(cachedUserInfo), 'EX', AUTH_EXPIRE_TIME);
      await this.redis.zadd('sessions:active', Date.now() + AUTH_EXPIRE_TIME * 1000, user.loginId);
      if (oldSessionId) {
        await this.redis.unlink(`user:${oldSessionId}`);
      }

      return { sessionId: sessionId, userInfo: userInfoDto };
    } catch (err) {
      if (err instanceof AppException) throw err;
      this.logger.error(err);
      throw new AppException(AuthErrorCode.LOGIN_FAILED);
    }
  }

  async getUserInfo(sid: string) {
    try {
      const userInfo = await this.getUserSession(sid);
      const userInfoDto: UserInfoDto = new UserInfoDto();
      userInfoDto.loginId = userInfo.loginId;
      return userInfoDto;
    } catch (err) {
      if (err instanceof AppException) throw err;
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
        roles: this.buildSessionRoles(USER_ROLE.USER),
        targetEvent: null,
      };

      await this.redis.set(`user-id:${guestId}`, uuid, 'EX', AUTH_EXPIRE_TIME);
      await this.redis.set(`user:${uuid}`, JSON.stringify(guestSession), 'EX', AUTH_EXPIRE_TIME);
      await this.redis.zadd('sessions:active', Date.now() + AUTH_EXPIRE_TIME * 1000, guestId);

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
