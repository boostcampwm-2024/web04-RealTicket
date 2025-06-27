import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Request } from 'express';
import Redis from 'ioredis';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

import { winstonLogger } from '../winston.logger';

interface UserSession {
  id: number;
  loginId: string;
  userStatus: string;
  targetEvent: any;
}

interface CachedUserInfo {
  userDBId: string;
  userLoginId: string;
  timestamp: number;
}

interface UserInfo {
  userDBId: string;
  userLoginId: string;
}

@Injectable()
export class DetailedRequestLoggingInterceptor implements NestInterceptor {
  private readonly redis: Redis | null;
  private readonly userCache = new Map<string, CachedUserInfo>();
  private readonly CACHE_TTL = 5 * 60 * 1000;
  private readonly MAX_CACHE_SIZE = 1000;

  constructor(private readonly redisService: RedisService) {
    this.redis = this.redisService.getOrThrow();
    setInterval(() => this.cleanupExpiredCache(), 5 * 60 * 1000);
  }

  private async getUserInfo(sid: string): Promise<UserInfo> {
    const cached = this.userCache.get(sid);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return {
        userDBId: cached.userDBId,
        userLoginId: cached.userLoginId,
      };
    }

    if (!this.redis) {
      return { userDBId: 'unknown', userLoginId: 'unknown' };
    }

    try {
      const userDataStr = await this.redis.get(`user:${sid}`);
      if (userDataStr) {
        const userSession: UserSession = JSON.parse(userDataStr);
        const userInfo: UserInfo = {
          userDBId: userSession.id.toString(),
          userLoginId: userSession.loginId,
        };

        this.cacheUserInfo(sid, userInfo);
        return userInfo;
      }
    } catch (error) {
      winstonLogger.warn(
        `Failed to get user info for SID: ${sid} - ${error.message}`,
        'DetailedRequestLogging',
      );
    }

    return { userDBId: 'unknown', userLoginId: 'unknown' };
  }

  private cacheUserInfo(sid: string, userInfo: UserInfo): void {
    if (this.userCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.userCache.keys().next().value;
      this.userCache.delete(oldestKey);
    }

    this.userCache.set(sid, {
      userDBId: userInfo.userDBId,
      userLoginId: userInfo.userLoginId,
      timestamp: Date.now(),
    });
  }

  private cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [sid, cached] of this.userCache.entries()) {
      if (now - cached.timestamp >= this.CACHE_TTL) {
        this.userCache.delete(sid);
      }
    }
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, body } = request;
    const startTime = Date.now();

    (request as any).hasDetailedLogging = true;

    const sid = request.cookies['SID'];
    const { userDBId, userLoginId } = sid
      ? await this.getUserInfo(sid)
      : { userDBId: 'unknown', userLoginId: 'unknown' };

    winstonLogger.log(
      `[REQ] ${method} ${url} | User: ${userDBId}(${userLoginId}) | Body: ${JSON.stringify(body)}`,
      'DetailedAPI',
    );

    return next.handle().pipe(
      tap((response) => {
        const responseTime = Date.now() - startTime;
        winstonLogger.log(
          `[RES] ${method} ${url} | User: ${userDBId}(${userLoginId}) | ${responseTime}ms | Response: ${JSON.stringify(response)}`,
          'DetailedAPI',
        );
      }),
      catchError((error) => {
        const responseTime = Date.now() - startTime;
        const response = context.switchToHttp().getResponse();

        let statusCode = response.statusCode || 500;
        if (error.getStatus && typeof error.getStatus === 'function') {
          statusCode = error.getStatus();
        }

        winstonLogger.error(
          `[ERR] ${method} ${url} | User: ${userDBId}(${userLoginId}) | Status: ${statusCode} | ${responseTime}ms | Error: ${error.message}`,
          error.stack,
          'DetailedAPI',
        );
        throw error;
      }),
    );
  }
}
