import { RedisService } from '@liaoliaots/nestjs-redis';
import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { DataSource, In } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { USER_STATUS } from '../../../auth/const/userStatus.const';
import { AuthService } from '../../../auth/service/auth.service';
import { UserParamDto } from '../../../util/user-injection/userParamDto';
import { Reservation } from '../../reservation/entity/reservation.entity';
import { ReservedSeat } from '../../reservation/entity/reservedSeat.entity';
import { USER_ROLE } from '../const/userRole';
import { UserCreateDto } from '../dto/userCreate.dto';
import { UserInfoDto } from '../dto/userInfo.dto';
import { UserLoginIdCheckDto } from '../dto/userLoginIdCheck.dto';
import { User } from '../entity/user.entity';
import { UserRepository } from '../repository/user.repository';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly redis: Redis;

  constructor(
    @Inject() private readonly userRepository: UserRepository,
    @Inject() private readonly redisService: RedisService,
    @Inject() private readonly authService: AuthService,
    @Inject() private readonly dataSource: DataSource,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async registerUser(userCreateDto: UserCreateDto, role: string = USER_ROLE.USER) {
    if (await this.userRepository.findByLoginId(userCreateDto.loginId)) {
      throw new ConflictException('이미 존재하는 사용자입니다.');
    }

    try {
      const { loginId, loginPassword } = userCreateDto;
      const hashedPassword = await this.hashingPassword(loginPassword);
      const newUser: Partial<User> = {
        loginId: loginId,
        loginPassword: hashedPassword,
        role: role,
      };
      await this.userRepository.createUser(newUser);
      return { message: '회원가입이 성공적으로 완료되었습니다.' };
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException('회원가입에 실패하였습니다.');
    }
  }

  async hashingPassword(password: string) {
    const saltRound = 10;
    return await bcrypt.hash(password, saltRound);
  }

  async validateUser(id: string, password: string) {
    try {
      const keyOfUserId = `user-id:${id}`;
      const oldSessionId = await this.redis.get(keyOfUserId);

      if (oldSessionId) {
        await this.redis.unlink(`user:${oldSessionId}`);
      }

      const user = await this.userRepository.findOne(id);
      if (!user) {
        throw new UnauthorizedException('아이디/비밀번호를 잘못 입력하셨습니다. 다시 입력해주세요');
      }

      const checkPasswordValid = await bcrypt.compare(password, user.loginPassword);
      if (!checkPasswordValid) {
        throw new UnauthorizedException('아이디/비밀번호를 잘못 입력하셨습니다. 다시 입력해주세요');
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
      // TODO
      // expired는 redis에서 자동으로 제공해주는 기능이있어 expiredAt은 필요 없을거같름
      await this.redis.set(`user-id:${id}`, sessionId, 'EX', 3600);
      await this.redis.set(`user:${sessionId}`, JSON.stringify(cachedUserInfo), 'EX', 3600);

      return { sessionId: sessionId, userInfo: userInfoDto };
    } catch (err) {
      this.logger.error(err);
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new InternalServerErrorException('서버에서 문제가 발생하였습니다.');
    }
  }

  async isAvailableLoginId(userLoginIdCheckDto: UserLoginIdCheckDto) {
    const User = await this.userRepository.findByLoginId(userLoginIdCheckDto.loginId);
    if (User) {
      return {
        available: false,
      };
    } else {
      return {
        available: true,
      };
    }
  }

  async getUserInfo(sid: string) {
    try {
      const userInfo = await this.authService.getUserSession(sid);
      const userInfoDto: UserInfoDto = new UserInfoDto();
      userInfoDto.loginId = userInfo.loginId;
      return userInfoDto;
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException('사용자 정보를 불러오는데 실패하였습니다.');
    }
  }

  async logoutUser(sid: string, { loginId }: UserParamDto) {
    try {
      if ((await this.authService.removeSession(sid, loginId)) > 0) {
        return { message: '로그아웃 되었습니다.' };
      }
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException('로그아웃에 실패하였습니다.');
    }
  }

  async setUserEventTarget(sid: string, eventId: number) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));

    this.redis.set(`user:${sid}`, JSON.stringify({ ...session, targetEvent: eventId }));
  }

  async getUserEventTarget(sid: string) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    return session.targetEvent;
  }

  async makeGuestUser() {
    try {
      // make guest user
      const uuid = uuidv4();
      const guestId = `guest-${uuid}`;

      const guestInfo = await this.userRepository.createUser({
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

      this.redis.set(`user-id:${guestId}`, uuid, 'EX', 3600);
      this.redis.set(`user:${uuid}`, JSON.stringify(guestSession), 'EX', 3600);

      return { sessionId: uuid, userInfo: guestSession };
    } catch (err) {
      this.logger.error(err.name, err.stack);
      throw new InternalServerErrorException('게스트 사용자 생성에 실패하였습니다.');
    }
  }

  @Cron('0 0 0 * * *', { name: 'removeGuestReservation' })
  async removeAllGuest() {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const user = await queryRunner.manager.find(User, { where: { checkGuest: true } });
      const userIds = user.map((u) => u.id);

      const reservationIds = await queryRunner.manager.find(Reservation, { where: { user: In(userIds) } });
      await queryRunner.manager.delete(ReservedSeat, { reservation: In(reservationIds.map((r) => r.id)) });
      await queryRunner.manager.delete(Reservation, { user: In(userIds) });
      await queryRunner.manager.delete(User, { id: In(userIds) });

      await queryRunner.commitTransaction();

      return this.userRepository.deleteAllGuest();
    } catch (err) {
      this.logger.error(err.name, err.stack);
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('게스트 사용자 삭제에 실패하였습니다.');
    }
  }
}
