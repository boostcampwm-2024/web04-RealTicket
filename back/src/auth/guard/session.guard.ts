import { RedisService } from '@liaoliaots/nestjs-redis';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import Redis from 'ioredis';

import { AppException } from '../../common/exception/app.exception';
import { AUTH_EXPIRE_TIME } from '../const/authExpireTime.const';
import { USER_LEVEL, USER_STATUS } from '../const/userStatus.const';
import { AuthErrorCode } from '../exception/auth-error-code';

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
        throw new AppException(AuthErrorCode.FORBIDDEN);
      }

      const session = JSON.parse(sessionData);
      if (!session) {
        throw new AppException(AuthErrorCode.SESSION_EXPIRED);
      }

      const statusesToCheck = Array.isArray(requiredStatuses) ? requiredStatuses : [requiredStatuses];

      for (const requiredStatus of statusesToCheck) {
        if (USER_LEVEL[session.userStatus] >= USER_LEVEL[requiredStatus]) {
          await this.redis.expireat(`user:${sessionId}`, Math.round(Date.now() / 1000) + AUTH_EXPIRE_TIME);
          return true;
        }
      }
      throw new AppException(AuthErrorCode.UNAUTHORIZED);
    }
  }

  return SessionGuard;
}
