import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';

import { USER_STATUS } from '../../../auth/const/userStatus.const';
import { AuthService } from '../../../auth/service/auth.service';
import { CreateUserDto } from '../dto/userLogin.dto';
import { UserRepository } from '../repository/user.repository';

@Injectable()
export class UserService {
  private readonly redis: Redis;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async registerUser(createUserDto: CreateUserDto) {
    const { login_id, login_password } = createUserDto;
    const hashedPassword = await this.hashingPassword(login_password);
    const newUser: object = {
      login_id: login_id,
      login_password: hashedPassword,
    };
    return await this.userRepository.createUser(newUser);
  }

  async hashingPassword(password: string) {
    const saltRound = 10;
    return await bcrypt.hash(password, saltRound);
  }

  async loginUser(id: string, password: string): Promise<string | null> {
    console.log('loginUser');
    const user = await this.userRepository.findOne(id);
    console.log(user);

    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    const checkPasswordValid = await bcrypt.compare(password, user.loginPassword);
    if (!checkPasswordValid) {
      throw new UnauthorizedException('비밀번호가 일치하지 않습니다.');
    }
    const cachedUserInfo = {
      id: user.id,
      login_id: user.loginId,
      user_status: USER_STATUS.LOGIN,
      target_event: null,
    };
    const sessionId = uuidv4();
    // TODO
    // expired는 redis에서 자동으로 제공해주는 기능이있어 expiredAt은 필요 없을거같름
    await this.redis.set(sessionId, JSON.stringify(cachedUserInfo), 'EX', 3600);
    return sessionId;
  }

  async logoutUser(sid: string) {
    if ((await this.authService.removeSession(sid)) > 0) {
      return { message: '로그아웃 되었습니다.' };
    }
    throw new UnauthorizedException('로그아웃에 실패했습니다.');
  }
}