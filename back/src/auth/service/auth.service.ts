import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import Redis from 'ioredis';

import { UserEntity } from '../../user/entity/user.entity';
import { UserRepository } from '../../user/repository/user.repository';

@Injectable()
export class AuthService {
  private readonly redis: Redis | null;

  constructor(
    private redisService: RedisService,
    private readonly userRepository: UserRepository,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async validateUser({ id, password }): Promise<UserEntity | null> {
    // 1. 데이터베이스에서 사용자 정보를 조회 (최초 로그인 시)
    // 분리해야됨 로그인 요청을 보낼때마다 DB조회가 실행됨
    const user = await this.userRepository.findOne(id);
    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    // 2. 비밀번호 검증
    //const isPasswordValid = await bcrypt.compare(password, user.login_password);
    const isPasswordValid = bcrypt.compare(password, user.login_password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('비밀번호가 일치하지 않습니다.');
    }
    return user; // 사용자 정보 반환
  }
}
