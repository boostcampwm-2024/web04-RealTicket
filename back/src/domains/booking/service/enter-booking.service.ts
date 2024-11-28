import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { AuthService } from '../../../auth/service/auth.service';
import { ENTERING_GC_INTERVAL, ENTERING_SESSION_EXPIRY } from '../const/enterBooking.const';

@Injectable()
export class EnterBookingService {
  private readonly redis: Redis | null;
  constructor(
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async gcEnteringSessions(eventId: number) {
    setInterval(() => {
      this.removeExpiredSessions(eventId);
    }, ENTERING_GC_INTERVAL);
  }

  async addEnteringSession(sid: string) {
    const eventId = await this.authService.getUserEventTarget(sid);
    const timestamp = Date.now();
    await this.redis.zadd(`entering:${eventId}`, timestamp, sid);
    return true;
  }

  async removeEnteringSession(sid: string) {
    const eventId = await this.authService.getUserEventTarget(sid);
    await this.redis.zrem(`entering:${eventId}`, sid);
    return true;
  }

  async getEnteringSessionCount(eventId: number) {
    return this.redis.zcard(`entering:${eventId}`);
  }

  private async removeExpiredSessions(eventId: number) {
    const expiryTimestamp = Date.now() - ENTERING_SESSION_EXPIRY;
    await this.redis.zremrangebyscore(`entering:${eventId}`, 0, expiryTimestamp);
  }
}
