import { RedisService } from '@liaoliaots/nestjs-redis';
import { ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';

import { USER_LEVEL, USER_STATUS } from '../const/userStatus.const';

export function SessionAuthGuard(userStatus: string = USER_STATUS.LOGIN) {
  @Injectable()
  class SessionGuard {
    readonly redis: Redis;

    constructor(readonly redisService: RedisService) {
      this.redis = this.redisService.getOrThrow();
    }

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const request = context.switchToHttp().getRequest();
      const sessionId = getSid(request);
      const session = JSON.parse(await this.redis.get(sessionId));
      this.redis.expireat(sessionId, Math.round(Date.now() / 1000) + 3600);
      // TODO
      // userStatus, target_event를 비교하여 접근 허용 여부를 판단
      if (session && USER_LEVEL[session.userStatus] >= USER_LEVEL[userStatus]) {
        return true;
      } else if (!session) {
        throw new ForbiddenException('접근 권한이 없습니다.');
      } else if (USER_LEVEL[session.user_status] <= USER_LEVEL[userStatus]) {
        throw new UnauthorizedException('해당 페이지에 접근할 수 없습니다.');
      } else {
        throw new UnauthorizedException('세션이 만료되었습니다.');
      }
    }
  }

  return SessionGuard;
}

function getSid(request: any) {
  if (request.headers.cookie) {
    const SID: string = request.headers.cookie
      .split(';')
      .map((e: string) => {
        return e.trim().split('=');
      })
      .find((e: Array<string>) => e[0] === 'SID')[1];

    return SID;
  }
  return null;
}
