import { RedisService } from '@liaoliaots/nestjs-redis';
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import Redis from 'ioredis';

export function SessionAuthGuard(user_status: string) {
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
      // TODO
      // user_status, target_event를 비교하여 접근 허용 여부를 판단
      if (session && session.user_status === user_status) {
        return true;
      } else if (!session) {
        throw new UnauthorizedException('접근권한이 없습니다.');
      } else {
        throw new UnauthorizedException('세션이 만료되었습니다.');
      }
    }
  }

  return SessionGuard;
}

function getSid(request: any) {
  const SID: string = request.headers.cookie
    .split(';')
    .map((e: string) => {
      return e.trim().split('=');
    })
    .find((e: Array<string>) => e[0] === 'SID')[1];

  return SID;
}
