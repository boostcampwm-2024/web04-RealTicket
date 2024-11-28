import { RedisService } from '@liaoliaots/nestjs-redis';
import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import Redis from 'ioredis';

import { USER_LEVEL, USER_STATUS } from '../const/userStatus.const';

const EXPIRE_TIME = 3600;

export function SessionAuthGuard(requiredStatuses: string | string[] = USER_STATUS.LOGIN) {
  @Injectable()
  class SessionGuard {
    readonly redis: Redis;

    constructor(readonly redisService: RedisService) {
      this.redis = this.redisService.getOrThrow();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request: Request = context.switchToHttp().getRequest();
      const sessionId = request.cookies.SID;

      const sessionData = await this.redis.get(`user:${sessionId}`);
      if (!sessionData) {
        throw new ForbiddenException('접근 권한이 없습니다.');
      }

      const session = JSON.parse(sessionData);
      if (!session) {
        throw new UnauthorizedException('세션이 만료되었습니다.');
      }

      const statusesToCheck = Array.isArray(requiredStatuses) ? requiredStatuses : [requiredStatuses];

      for (const requiredStatus of statusesToCheck) {
        if (USER_LEVEL[session.userStatus] >= USER_LEVEL[requiredStatus]) {
          await this.redis.expireat(`user:${sessionId}`, Math.round(Date.now() / 1000) + EXPIRE_TIME);
          return true;
        }
      }
      throw new UnauthorizedException('해당 페이지에 접근할 수 없습니다.');
    }
  }

  return SessionGuard;
}
