import { RedisService } from '@liaoliaots/nestjs-redis';
import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

import { USER_STATUS } from '../../../auth/const/userStatus.const';
import { AuthService } from '../../../auth/service/auth.service';
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
    private readonly userRepository: UserRepository,
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async getUser(userId: number) {
    return await this.userRepository.findById(userId);
  }

  async registerUser(userCreateDto: UserCreateDto) {
    if (await this.userRepository.findByLoginId(userCreateDto.loginId)) {
      throw new ConflictException('이미 존재하는 사용자입니다.');
    }

    try {
      const { loginId, loginPassword } = userCreateDto;
      const hashedPassword = await this.hashingPassword(loginPassword);
      const newUser: Partial<User> = {
        loginId: loginId,
        loginPassword: hashedPassword,
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

  async loginUser(id: string, password: string): Promise<string | null> {
    const user = await this.userRepository.findOne(id);
    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    const checkPasswordValid = await bcrypt.compare(password, user.loginPassword);
    if (!checkPasswordValid) {
      throw new UnauthorizedException('비밀번호가 일치하지 않습니다.');
    }
    const cachedUserInfo = {
      id: user.id,
      loginId: user.loginId,
      userStatus: USER_STATUS.LOGIN,
      targetEvent: null,
    };
    const sessionId = uuidv4();
    // TODO
    // expired는 redis에서 자동으로 제공해주는 기능이있어 expiredAt은 필요 없을거같름
    await this.redis.set(sessionId, JSON.stringify(cachedUserInfo), 'EX', 3600);
    return sessionId;
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
      const userInfo = JSON.parse(await this.redis.get(sid));
      const userInfoDto: UserInfoDto = new UserInfoDto();
      userInfoDto.loginId = userInfo.loginId;
      userInfoDto.loginId = userInfo.loginId;
      return userInfoDto;
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException('사용자 정보를 불러오는데 실패하였습니다.');
    }
  }

  async logoutUser(sid: string) {
    try {
      if ((await this.authService.removeSession(sid)) > 0) {
        return { message: '로그아웃 되었습니다.' };
      }
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException('로그아웃에 실패하였습니다.');
    }
  }
}
