import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import Redis from 'ioredis';

import { AuthService } from '../../../auth/service/auth.service';
import { UserService } from '../../user/service/user.service';
import { ENTERING_GC_INTERVAL, ENTERING_SESSION_EXPIRY } from '../const/enterBooking.const';

@Injectable()
export class EnterBookingService {
  private readonly redis: Redis | null;
  constructor(
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly eventEmitter: EventEmitter2,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async gcEnteringSessions(eventId: number) {
    this.deleteIntervalIfExists(`gc-entering-${eventId}`);

    const interval = setInterval(() => {
      this.removeExpiredSessions(eventId);
      this.eventEmitter.emit('entering-sessions-gc', { eventId });
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

  async addEnteringSession(sid: string) {
    const eventId = await this.userService.getUserEventTarget(sid);
    const timestamp = Date.now();
    await this.redis.zadd(`entering:${eventId}`, timestamp, sid);
    return true;
  }

  async removeEnteringSession(sid: string) {
    const eventId = await this.userService.getUserEventTarget(sid);
    await this.redis.zrem(`entering:${eventId}`, sid);
    await this.removeBookingAmount(sid);
    return true;
  }

  async getEnteringSessionCount(eventId: number) {
    return this.redis.zcard(`entering:${eventId}`);
  }

  async setBookingAmount(sid: string, bookingAmount: number) {
    await this.redis.set(`entering:${sid}:temp-booking-amount`, bookingAmount);
    return parseInt(await this.redis.get(`entering:${sid}:temp-booking-amount`));
  }

  async getBookingAmount(sid: string) {
    const bookingAmountData = await this.redis.get(`entering:${sid}:temp-booking-amount`);
    if (!bookingAmountData) {
      return 0;
    }
    return parseInt(await this.redis.get(`entering:${sid}:temp-booking-amount`));
  }

  async removeBookingAmount(sid: string) {
    await this.redis.del(`entering:${sid}:temp-booking-amount`);
    return true;
  }

  private async removeExpiredSessions(eventId: number) {
    const expiryTimestamp = Date.now() - ENTERING_SESSION_EXPIRY;
    const key = `entering:${eventId}`;

    const multi = this.redis.multi();
    multi.zrangebyscore(key, 0, expiryTimestamp);
    multi.zremrangebyscore(key, 0, expiryTimestamp);

    const results = (await multi.exec()) as [[Error | null, string[]], [Error | null, number]];

    if (results[0][0]) {
      throw results[0][0];
    }
    const expiredSessions = results[0][1];

    expiredSessions.forEach((sid: string) => {
      this.authService.setUserStatusLogin(sid);
    });
  }

  async getAllEnteringSids(eventId: number) {
    return this.redis.zrange(`entering:${eventId}`, 0, -1);
  }

  async clearEnteringPool(eventId: number) {
    this.clearGCInterval(eventId);
    const keys = await this.redis.keys('entering:*');
    if (keys.length > 0) {
      await this.redis.unlink(...keys);
    }
  }
}
