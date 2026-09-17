import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import Redis from 'ioredis';

import { AuthService } from '../../../auth/service/auth.service';
import { ENTERING_GC_INTERVAL, ENTERING_SESSION_EXPIRY } from '../const/enterBooking.const';

@Injectable()
export class EnterBookingService {
  private readonly redis: Redis | null;
  constructor(
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async gcEnteringSessions(eventId: number) {
    this.deleteIntervalIfExists(`gc-entering-${eventId}`);

    const lockTtlSeconds = Math.floor((ENTERING_GC_INTERVAL * 0.8) / 1000);
    const lockKey = `gc-lock:entering:${eventId}`;

    const interval = setInterval(async () => {
      try {
        const acquired = await this.redis.set(lockKey, '1', 'EX', lockTtlSeconds, 'NX');
        if (acquired !== 'OK') {
          // 다른 레플리카가 GC를 실행 중이면 건너뛴다.
          return;
        }
        await this.removeExpiredSessions(eventId);
        await this.redis.publish('booking:events', JSON.stringify({ type: 'entering-sessions-gc', eventId }));
      } catch {
        // GC 실패가 주기 실행을 중단하지 않도록 다음 주기에 재시도한다.
      }
    }, ENTERING_GC_INTERVAL);

    this.schedulerRegistry.addInterval(`gc-entering-${eventId}`, interval);
  }

  clearGCInterval(eventId: number) {
    this.deleteIntervalIfExists(`gc-entering-${eventId}`);
  }

  private deleteIntervalIfExists(intervalName: string) {
    if (this.schedulerRegistry.doesExist('interval', intervalName)) {
      this.schedulerRegistry.deleteInterval(intervalName);
    }
  }

  async isEntering(eventId: number, sid: string) {
    const isMember = await this.redis.zscore(`entering:${eventId}`, sid);
    return isMember !== null;
  }

  async setBookingAmount(sid: string, bookingAmount: number) {
    await this.redis.set(`entering:${sid}:temp-booking-amount`, bookingAmount);
    return bookingAmount;
  }

  private async removeExpiredSessions(eventId: number) {
    const expiryTimestamp = Date.now() - ENTERING_SESSION_EXPIRY;
    const key = `entering:${eventId}`;

    const multi = this.redis.multi();
    multi.zrangebyscore(key, 0, expiryTimestamp);
    multi.zremrangebyscore(key, 0, expiryTimestamp);

    const results = (await multi.exec()) as [[Error | null, string[]], [Error | null, number]];

    const commandError = results[0][0] ?? results[1][0];
    if (commandError) {
      throw commandError;
    }
    const expiredSessions = results[0][1];

    if (expiredSessions.length > 0) {
      const amountKeys = expiredSessions.map((sid: string) => `entering:${sid}:temp-booking-amount`);
      await this.redis.unlink(...amountKeys);
    }

    await Promise.all(expiredSessions.map((sid: string) => this.authService.resetToLogin(sid, null)));
  }

  async getAllEnteringSids(eventId: number) {
    return this.redis.zrange(`entering:${eventId}`, 0, -1);
  }

  async clearEnteringPool(eventId: number) {
    this.clearGCInterval(eventId);

    const sids = await this.getAllEnteringSids(eventId);

    if (sids.length > 0) {
      const amountKeys = sids.map((sid) => `entering:${sid}:temp-booking-amount`);
      await this.redis.unlink(...amountKeys);
    }

    await this.redis.unlink(`entering:${eventId}`);
  }
}
