import { RedisService } from '@liaoliaots/nestjs-redis';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import Redis from 'ioredis';

import { AppException } from '../../common/exception/app.exception';
import { AUTH_EXPIRE_TIME } from '../const/authExpireTime.const';
import { AuthErrorCode } from '../exception/auth-error-code';

import {
  canAccessSessionRequirements,
  type SessionAuthRequirement,
} from './session-auth-requirement.policy';

function assertExplicitRequirements(requirements: SessionAuthRequirement) {
  if (typeof requirements === 'string') {
    return;
  }

  if (Array.isArray(requirements) && requirements.length > 0) {
    return;
  }

  throw new Error('SessionAuthGuard requires explicit session requirements');
}

export function SessionAuthGuard(requirements: SessionAuthRequirement) {
  assertExplicitRequirements(requirements);

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

      let session: any;
      try {
        session = JSON.parse(sessionData);
      } catch {
        throw new AppException(AuthErrorCode.SESSION_EXPIRED);
      }
      if (!session) {
        throw new AppException(AuthErrorCode.SESSION_EXPIRED);
      }

      if (canAccessSessionRequirements(session, requirements)) {
        await this.redis.expireat(`user:${sessionId}`, Math.round(Date.now() / 1000) + AUTH_EXPIRE_TIME);
        return true;
      }

      throw new AppException(AuthErrorCode.UNAUTHORIZED);
    }
  }

  return SessionGuard;
}
