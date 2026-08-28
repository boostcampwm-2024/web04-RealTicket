import { RedisService } from '@liaoliaots/nestjs-redis';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import Redis from 'ioredis';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';

import { AuthService } from '../../../auth/service/auth.service';
import { AppException } from '../../../common/exception/app.exception';
import { IN_BOOKING_DEFAULT_MAX_SIZE } from '../const/inBookingDefaultMaxSize.const';
import {
  SEATS_SSE_RETRY_TIMEOUT,
  RECONNECTING_SELECTING_GC_INTERVAL,
} from '../const/seatsSseRetryTime.const';
import { BookingErrorCode } from '../exception/booking-error-code';
import {
  runAddBookedSeatLua,
  runFlushBookedSeatsLua,
  runRemoveBookedSeatLua,
  runSetInBookingSavedLua,
  runSetSubscribedSectionLua,
} from '../luaScripts/inBookingSessionLua';

type InBookingSession = {
  sid: string;
  bookingAmount: number;
  bookedSeats: [number, number][];
  saved: boolean;
  subscribedSection: number | null;
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
      subscribedSection: null,
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
    await runAddBookedSeatLua(this.redis, {
      inBookingSessionsKey: this.getEventKey(eventId),
      sid,
      seat,
      enforceQuota: false,
    });
  }

  async getBookedSeats(eventId: number, sid: string): Promise<[number, number][]> {
    const session = await this.getSession(eventId, sid);
    if (!session) {
      return [];
    }
    return session.bookedSeats;
  }

  async removeBookedSeat(eventId: number, sid: string, seat: [number, number]): Promise<void> {
    await runRemoveBookedSeatLua(this.redis, {
      inBookingSessionsKey: this.getEventKey(eventId),
      sid,
      seat,
      requireBooked: false,
    });
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
    await runSetInBookingSavedLua(this.redis, {
      inBookingSessionsKey: this.getEventKey(eventId),
      sid,
      saved,
    });
  }

  async setSubscribedSection(eventId: number, sid: string, sectionIndex: number | null) {
    await runSetSubscribedSectionLua(this.redis, {
      inBookingSessionsKey: this.getEventKey(eventId),
      sid,
      sectionIndex,
    });
  }

  async emitSession(eventId: number, sid: string) {
    if (eventId !== 0) {
      await this.removeInBooking(eventId, sid);
      await this.authService.resetToLogin(sid, null);
    }
  }

  private getEventKey(eventId: number) {
    return `in-booking:${eventId}:sessions`;
  }

  async setSession(eventId: number, inBookingSession: InBookingSession): Promise<void> {
    const eventKey = this.getEventKey(eventId);
    await this.redis.hset(eventKey, inBookingSession.sid, JSON.stringify(inBookingSession));
  }

  async getSession(eventId: number, sid: string): Promise<InBookingSession | null> {
    const session = await this.redis.hget(this.getEventKey(eventId), sid);
    return session ? JSON.parse(session) : null;
  }

  private async removeInBooking(eventId: number, sid: string): Promise<void> {
    await this.redis.hdel(this.getEventKey(eventId), sid);
  }

  async getBookAmountAndBookedSeats(sid: string, eventId: number) {
    const session = await this.getSession(eventId, sid);
    if (!session) {
      throw new AppException(BookingErrorCode.SEAT_SESSION_NOT_FOUND);
    }
    return {
      bookingAmount: session.bookingAmount,
      bookedSeats: session.bookedSeats,
    };
  }

  async validateAndAddBookedSeat(eventId: number, sid: string, target: [number, number]): Promise<void> {
    const { code } = await runAddBookedSeatLua(this.redis, {
      inBookingSessionsKey: this.getEventKey(eventId),
      sid,
      seat: target,
      enforceQuota: true,
    });

    if (code === 'SESSION_NOT_FOUND') {
      throw new AppException(BookingErrorCode.SEAT_SESSION_NOT_FOUND);
    }
    if (code === 'QUOTA_EXCEEDED') {
      throw new AppException(BookingErrorCode.SEAT_QUOTA_EXCEEDED);
    }
  }

  async validateAndRemoveBookedSeat(eventId: number, sid: string, target: [number, number]): Promise<void> {
    const { code } = await runRemoveBookedSeatLua(this.redis, {
      inBookingSessionsKey: this.getEventKey(eventId),
      sid,
      seat: target,
      requireBooked: true,
    });

    if (code === 'CANCEL_EMPTY') {
      throw new AppException(BookingErrorCode.SEAT_CANCEL_EMPTY);
    }
    if (code === 'SEAT_NOT_BOOKED') {
      throw new AppException(BookingErrorCode.SEAT_NOT_BOOKED);
    }
  }

  async flushAndSetBookingAmount(
    eventId: number,
    sid: string,
    amount: number,
  ): Promise<{ flushedSeats: [number, number][] }> {
    const { seats } = await runFlushBookedSeatsLua(this.redis, {
      inBookingSessionsKey: this.getEventKey(eventId),
      sid,
      bookingAmount: amount,
    });

    return { flushedSeats: seats };
  }

  async flushUnsavedBookedSeats(eventId: number, sid: string): Promise<[number, number][]> {
    const { seats } = await runFlushBookedSeatsLua(this.redis, {
      inBookingSessionsKey: this.getEventKey(eventId),
      sid,
      onlyWhenUnsaved: true,
    });

    return seats;
  }

  async getAllInBookingSids(eventId: number): Promise<string[]> {
    const result = await this.redis.hgetall(this.getEventKey(eventId));
    return result ? Object.keys(result) : [];
  }

  async clearInBookingPool(eventId: number) {
    await this.redis.unlink(`in-booking:${eventId}:sessions`, `in-booking:${eventId}:max-size`);
  }

  async gcReconnectingSessions(eventId: number) {
    this.deleteReconnectingIntervalIfExists(`gc-reconnecting-${eventId}`);

    const lockTtlSeconds = Math.max(1, Math.ceil((RECONNECTING_SELECTING_GC_INTERVAL * 0.8) / 1000));
    const lockKey = `gc-lock:reconnecting:${eventId}`;

    const interval = setInterval(async () => {
      try {
        const acquired = await this.redis.set(lockKey, '1', 'EX', lockTtlSeconds, 'NX');
        if (acquired !== 'OK') {
          // 다른 레플리카가 이미 GC 실행 중 — 현재 사이클 skip
          return;
        }
        await this.removeExpiredReconnectingSessions(eventId);
      } catch {
        // 락/GC 실패: 다음 사이클에 재시도. 예외가 interval을 죽이지 않도록 흡수.
      }
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

  async removeReconnectingSession(eventId: number, sid: string) {
    await this.redis.zrem(`reconnecting:${eventId}`, sid);
    return true;
  }

  private async removeExpiredReconnectingSessions(eventId: number) {
    const expiryTimestamp = Date.now() - SEATS_SSE_RETRY_TIMEOUT;
    const key = `reconnecting:${eventId}`;

    const multi = this.redis.multi();
    multi.zrangebyscore(key, 0, expiryTimestamp);
    multi.zremrangebyscore(key, 0, expiryTimestamp);

    const results = (await multi.exec()) as [[Error | null, string[]], [Error | null, number]];

    const commandError = results[0][0] ?? results[1][0];
    if (commandError) {
      throw commandError;
    }
    const expiredSessions = results[0][1];

    expiredSessions.forEach((sid: string) => {
      this.eventEmitter.emit('seats-sse-close', { sid });
    });
  }

  async clearReconnectingPool(eventId: number) {
    this.clearReconnectingGCInterval(eventId);
    await this.redis.unlink(`reconnecting:${eventId}`);
  }

  @OnEvent('logout-start')
  async handleLogoutStart(payload: { sid: string; sessionData: string }) {
    try {
      const { sid, sessionData } = payload;

      const userSession = JSON.parse(sessionData);
      const eventId = userSession?.targetEvent;

      if (eventId === null || eventId === undefined || eventId === 0) {
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
