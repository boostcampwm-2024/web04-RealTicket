import { RedisService } from '@liaoliaots/nestjs-redis';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import Redis from 'ioredis';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';

import { AuthService } from '../../../auth/service/auth.service';
import { IN_BOOKING_DEFAULT_MAX_SIZE } from '../const/inBookingDefaultMaxSize.const';
import {
  SEATS_SSE_RETRY_TIMEOUT,
  RECONNECTING_SELECTING_GC_INTERVAL,
} from '../const/seatsSseRetryTime.const';

type InBookingSession = {
  sid: string;
  bookingAmount: number;
  bookedSeats: [number, number][];
  saved: boolean;
};

@Injectable()
export class InBookingService {
  private readonly redis: Redis | null;
  constructor(
    private readonly authService: AuthService,
    private redisService: RedisService,
    private eventEmitter: EventEmitter2,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async getInBookingSessionsDefaultMaxSize() {
    const defaultMaxSizeData = await this.redis.get('in-booking:default-max-size');
    if (defaultMaxSizeData) {
      return parseInt(defaultMaxSizeData);
    }
    return IN_BOOKING_DEFAULT_MAX_SIZE;
  }

  async setInBookingSessionsDefaultMaxSize(size: number) {
    await this.redis.set('in-booking:default-max-size', size);
    return size;
  }

  async setInBookingSessionsMaxSize(eventId: number, size: number) {
    await this.redis.set(`in-booking:${eventId}:max-size`, size);
    await this.redis.publish(
      'booking:events',
      JSON.stringify({ type: 'in-booking-max-size-changed', eventId }),
    );
    return size;
  }

  async setAllInBookingSessionsMaxSize(size: number) {
    const keys = await this.redis.keys('in-booking:*:max-size');
    await Promise.all(keys.map((key) => this.redis.set(key, size)));
    await this.redis.publish('booking:events', JSON.stringify({ type: 'all-in-booking-max-size-changed' }));
    return size;
  }

  async isInBooking(eventId: number, sid: string) {
    const session = await this.getSession(eventId, sid);
    return !!session;
  }

  async insertInBooking(eventId: number, sid: string, bookingAmount: number = 0): Promise<boolean> {
    const session: InBookingSession = {
      sid,
      bookingAmount,
      bookedSeats: [],
      saved: false,
    };
    await this.setSession(eventId, session);
    return true;
  }

  async setBookingAmount(eventId: number, sid: string, amount: number): Promise<number> {
    const session = await this.getSession(eventId, sid);

    session.bookingAmount = amount;
    await this.setSession(eventId, session);

    return amount;
  }

  async getBookingAmount(eventId: number, sid: string): Promise<number> {
    const session = await this.getSession(eventId, sid);
    return session.bookingAmount;
  }

  async addBookedSeat(eventId: number, sid: string, seat: [number, number]): Promise<void> {
    const session = await this.getSession(eventId, sid);
    session.bookedSeats.push(seat);
    await this.setSession(eventId, session);
  }

  async getBookedSeats(eventId: number, sid: string): Promise<[number, number][]> {
    const session = await this.getSession(eventId, sid);
    if (!session) {
      return [];
    }
    return session.bookedSeats;
  }

  async removeBookedSeat(eventId: number, sid: string, seat: [number, number]): Promise<void> {
    const session = await this.getSession(eventId, sid);
    session.bookedSeats = session.bookedSeats.filter((s) => s[0] !== seat[0] || s[1] !== seat[1]);
    await this.setSession(eventId, session);
  }

  async removeBookedSeats(eventId: number, sid: string) {
    const session = await this.getSession(eventId, sid);
    session.bookedSeats = [];
    await this.setSession(eventId, session);
  }

  async getIsSaved(eventId: number, sid: string) {
    const session = await this.getSession(eventId, sid);
    return session.saved;
  }

  async setIsSaved(eventId: number, sid: string, saved: boolean) {
    const session = await this.getSession(eventId, sid);
    session.saved = saved;
    await this.setSession(eventId, session);
  }

  async emitSession(eventId: number, sid: string) {
    if (eventId !== 0) {
      await this.removeInBooking(eventId, sid);
      await this.authService.setUserStatusLogin(sid);
      await this.authService.setUserEventTarget(sid, 0);
    }
  }

  async getInBookingSessionsMaxSize(eventId: number) {
    return parseInt(await this.redis.get(`in-booking:${eventId}:max-size`));
  }

  async getInBookingSessionCount(eventId: number): Promise<number> {
    return this.redis.scard(this.getEventKey(eventId));
  }

  private getSessionKey(eventId: number, sid: string) {
    return `in-booking:${eventId}:session:${sid}`;
  }

  private getEventKey(eventId: number) {
    return `in-booking:${eventId}:sessions`;
  }

  async setSession(eventId: number, inBookingSession: InBookingSession): Promise<void> {
    const sessionKey = this.getSessionKey(eventId, inBookingSession.sid);
    const eventKey = this.getEventKey(eventId);

    await this.redis.sadd(eventKey, inBookingSession.sid);
    await this.redis.set(sessionKey, JSON.stringify(inBookingSession));
  }

  async getSession(eventId: number, sid: string): Promise<InBookingSession | null> {
    const session = await this.redis.get(this.getSessionKey(eventId, sid));
    return session ? JSON.parse(session) : null;
  }

  private async removeInBooking(eventId: number, sid: string): Promise<void> {
    const session = await this.getSession(eventId, sid);
    if (session) {
      await this.redis.del(this.getSessionKey(eventId, sid));
      await this.redis.srem(this.getEventKey(eventId), sid);
    }
  }

  async getBookAmountAndBookedSeats(sid: string, eventId: number) {
    const session = await this.getSession(eventId, sid);
    return {
      bookingAmount: session.bookingAmount,
      bookedSeats: session.bookedSeats,
    };
  }

  async validateAndAddBookedSeat(eventId: number, sid: string, target: [number, number]): Promise<void> {
    const session = await this.getSession(eventId, sid);
    if (!session) {
      throw new BadRequestException('좌석 선택 세션이 존재하지 않습니다.');
    }
    if (session.bookingAmount <= session.bookedSeats.length) {
      throw new BadRequestException('예약 가능한 좌석 수를 초과했습니다.');
    }
    session.bookedSeats.push(target);
    await this.setSession(eventId, session);
  }

  async validateAndRemoveBookedSeat(eventId: number, sid: string, target: [number, number]): Promise<void> {
    const session = await this.getSession(eventId, sid);
    if (!session || session.bookedSeats.length === 0) {
      throw new BadRequestException('취소할 수 있는 좌석이 없습니다.');
    }
    if (!session.bookedSeats.some((seat) => seat[0] === target[0] && seat[1] === target[1])) {
      throw new BadRequestException('예약하지 않은 좌석입니다.');
    }
    session.bookedSeats = session.bookedSeats.filter((s) => s[0] !== target[0] || s[1] !== target[1]);
    await this.setSession(eventId, session);
  }

  async flushAndSetBookingAmount(
    eventId: number,
    sid: string,
    amount: number,
  ): Promise<{ flushedSeats: [number, number][] }> {
    const session = await this.getSession(eventId, sid);
    if (!session) {
      return { flushedSeats: [] };
    }
    const flushedSeats = [...session.bookedSeats];
    session.bookedSeats = [];
    session.bookingAmount = amount;
    await this.setSession(eventId, session);
    return { flushedSeats };
  }

  async getAllInBookingSids(eventId: number) {
    return this.redis.smembers(this.getEventKey(eventId));
  }

  async clearInBookingPool(eventId: number) {
    const keys = await this.redis.keys(`in-booking:${eventId}:*`);
    if (keys.length > 0) {
      await this.redis.unlink(...keys);
    }
  }

  async gcReconnectingSessions(eventId: number) {
    this.deleteReconnectingIntervalIfExists(`gc-reconnecting-${eventId}`);

    const interval = setInterval(() => {
      this.removeExpiredReconnectingSessions(eventId);
    }, RECONNECTING_SELECTING_GC_INTERVAL);

    this.schedulerRegistry.addInterval(`gc-reconnecting-${eventId}`, interval);
  }

  clearReconnectingGCInterval(eventId: number) {
    this.deleteReconnectingIntervalIfExists(`gc-reconnecting-${eventId}`);
  }

  private deleteReconnectingIntervalIfExists(intervalName: string) {
    if (this.schedulerRegistry.doesExist('interval', intervalName)) {
      this.schedulerRegistry.deleteInterval(intervalName);
    }
  }

  async addReconnectingSession(eventId: number, sid: string) {
    const timestamp = Date.now();
    await this.redis.zadd(`reconnecting:${eventId}`, timestamp, sid);
    return true;
  }

  async removeReconnectingSession(eventId: number, sid: string) {
    await this.redis.zrem(`reconnecting:${eventId}`, sid);
    return true;
  }

  async getReconnectingSessionCount(eventId: number) {
    return this.redis.zcard(`reconnecting:${eventId}`);
  }

  private async removeExpiredReconnectingSessions(eventId: number) {
    const expiryTimestamp = Date.now() - SEATS_SSE_RETRY_TIMEOUT;
    const key = `reconnecting:${eventId}`;

    const multi = this.redis.multi();
    multi.zrangebyscore(key, 0, expiryTimestamp);
    multi.zremrangebyscore(key, 0, expiryTimestamp);

    const results = (await multi.exec()) as [[Error | null, string[]], [Error | null, number]];

    if (results[0][0]) {
      throw results[0][0];
    }
    const expiredSessions = results[0][1];

    expiredSessions.forEach((sid: string) => {
      this.eventEmitter.emit('seats-sse-close', { sid });
    });
  }

  async clearReconnectingPool(eventId: number) {
    this.clearReconnectingGCInterval(eventId);
    const keys = await this.redis.keys(`reconnecting:${eventId}:*`);
    if (keys.length > 0) {
      await this.redis.unlink(...keys);
    }
  }

  @OnEvent('logout-start')
  async handleLogoutStart(payload: { sid: string; sessionData: string }) {
    try {
      const { sid, sessionData } = payload;

      const userSession = JSON.parse(sessionData);
      const eventId = userSession?.targetEvent;

      if (!eventId || eventId === 0) {
        return;
      }

      const inBookingSession = await this.getSession(eventId, sid);

      if (!inBookingSession) {
        return;
      }

      const bookedSeats = inBookingSession.bookedSeats;

      if (bookedSeats && bookedSeats.length > 0) {
        this.eventEmitter.emit('logout-release-seats', {
          sid,
          eventId,
          bookedSeats,
        });
      }

      await this.removeInBooking(eventId, sid);
      await this.redis.zrem(`reconnecting:${eventId}`, sid);
    } catch (error) {
      this.logger.error(`(로그아웃) InBooking 세션 정리 실패: ${error.message}`, error.stack);
    }
  }
}
