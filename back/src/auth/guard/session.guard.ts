import { RedisService } from '@liaoliaots/nestjs-redis';
import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import Redis from 'ioredis';

import { USER_LEVEL, USER_STATUS } from '../const/userStatus.const';

const EXPIRE_TIME = 3600;

export function SessionAuthGuard(userStatus: string = USER_STATUS.LOGIN) {
  @Injectable()
  class SessionGuard {
    readonly redis: Redis;

    constructor(readonly redisService: RedisService) {
      this.redis = this.redisService.getOrThrow();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request: Request = context.switchToHttp().getRequest();

      const sessionId = request.cookies.SID;
      const session = JSON.parse(await this.redis.get(`user:${sessionId}`));
      this.redis.expireat(sessionId, Math.round(Date.now() / 1000) + EXPIRE_TIME);
      // TODO
      // userStatus, target_event를 비교하여 접근 허용 여부를 판단
      if (session && USER_LEVEL[session.userStatus] >= USER_LEVEL[userStatus]) {
        return true;
      } else if (!session) {
        throw new ForbiddenException('접근 권한이 없습니다.');
      } else if (USER_LEVEL[session.userStatus] < USER_LEVEL[userStatus]) {
        throw new UnauthorizedException('해당 페이지에 접근할 수 없습니다.');
      } else {
        throw new UnauthorizedException('세션이 만료되었습니다.');
      }
    }
  }

  return SessionGuard;
}
