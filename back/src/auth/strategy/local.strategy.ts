import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { v4 as uuidv4 } from 'uuid';

import { UserEntity } from '../../user/entity/user.entity';
import { AuthService } from '../service/auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  // TODO
  // UserService를 AuthService로 분리해야할까?
  private readonly redis;

  constructor(
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
  ) {
    super({
      usernameField: 'login_id',
      passwordField: 'login_password',
    });
    this.redis = this.redisService.getOrThrow();
  }

  async validate(id: string, password: string): Promise<any> {
    const user: UserEntity = await this.authService.validateUser({
      id: id,
      password: password,
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    // 3. Redis에 사용자 정보 캐싱 (비밀번호 제외 )
    const cachedUserInfo = {
      id: user.id,
      login_id: user.login_id,
    };
    const sessionId = uuidv4();
    await this.redis.set(`SID:${sessionId}`, JSON.stringify(cachedUserInfo), 'EX', 3600); // TTL 설정 (1시간)

    // 세션 ID를 Request 객체에 추가
    // `user` 객체에 `SID` 추가
    return { ...user, SID: sessionId };
  }
}
