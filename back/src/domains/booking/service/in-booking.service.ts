import { RedisService } from '@liaoliaots/nestjs-redis';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import Redis from 'ioredis';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';

import { AuthService } from '../../../auth/service/auth.service';
import { UserService } from '../../user/service/user.service';
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
    private readonly userService: UserService,
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
    const defaultMaxSize = parseInt(await this.redis.get('in-booking:default-max-size'));
    return defaultMaxSize;
  }

  async setInBookingSessionsMaxSize(eventId: number, size: number) {
    await this.redis.set(`in-booking:${eventId}:max-size`, size);
    this.eventEmitter.emit('in-booking-max-size-changed', { eventId });
    return parseInt(await this.redis.get(`in-booking:${eventId}:max-size`));
  }

  async setAllInBookingSessionsMaxSize(size: number) {
    const keys = await this.redis.keys('in-booking:*:max-size');
    await Promise.all(keys.map((key) => this.redis.set(key, size)));

    this.eventEmitter.emit('all-in-booking-max-size-changed');

    const lastKey = keys[keys.length - 1];
    return parseInt(await this.redis.get(lastKey));
  }

  async isInBooking(sid: string) {
    const eventId = await this.getTargetEventId(sid);

    if (eventId === null) {
      return false;
    }

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

  async setBookingAmount(sid: string, amount: number): Promise<number> {
    const eventId = await this.getTargetEventId(sid);

    if (eventId === null) {
      throw new Error('예매 수량을 설정할 세션의 대상 이벤트를 불러올 수 없습니다.');
    }

    const session = await this.getSession(eventId, sid);

    session.bookingAmount = amount;
    await this.setSession(eventId, session);

    return amount;
  }

  async getBookingAmount(sid: string): Promise<number> {
    const eventId = await this.getTargetEventId(sid);

    if (eventId === null) {
      throw new Error('예매 수량을 조회할 세션의 대상 이벤트를 불러올 수 없습니다.');
    }

    const session = await this.getSession(eventId, sid);
    return session.bookingAmount;
  }

  async addBookedSeat(sid: string, seat: [number, number]): Promise<void> {
    const eventId = await this.getTargetEventId(sid);

    if (eventId === null) {
      throw new Error('점유한 좌석을 추가할 세션의 대상 이벤트를 불러올 수 없습니다.');
    }

    const session = await this.getSession(eventId, sid);
    session.bookedSeats.push(seat);
    await this.setSession(eventId, session);
  }

  async getBookedSeats(sid: string): Promise<[number, number][]> {
    const eventId = await this.getTargetEventId(sid);

    if (eventId === null) {
      return [];
    }

    const session = await this.getSession(eventId, sid);
    return session.bookedSeats;
  }

  async removeBookedSeat(sid: string, seat: [number, number]): Promise<void> {
    const eventId = await this.getTargetEventId(sid);

    if (eventId === null) {
      throw new Error('점유한 좌석을 제거할 세션의 대상 이벤트를 불러올 수 없습니다.');
    }

    const session = await this.getSession(eventId, sid);
    session.bookedSeats = session.bookedSeats.filter((s) => s[0] !== seat[0] || s[1] !== seat[1]);
    await this.setSession(eventId, session);
  }

  async removeBookedSeats(sid: string) {
    const eventId = await this.getTargetEventId(sid);

    if (eventId === null) {
      throw new Error('점유한 좌석을 모두 제거할 세션의 대상 이벤트를 불러올 수 없습니다.');
    }

    const session = await this.getSession(eventId, sid);
    session.bookedSeats = [];
    await this.setSession(eventId, session);
  }

  async getIsSaved(sid: string) {
    const eventId = await this.getTargetEventId(sid);

    if (eventId === null) {
      throw new Error('예약 저장 여부를 조회할 세션의 대상 이벤트를 불러올 수 없습니다.');
    }

    const session = await this.getSession(eventId, sid);
    return session.saved;
  }

  async setIsSaved(sid: string, saved: boolean) {
    const eventId = await this.getTargetEventId(sid);

    if (eventId === null) {
      throw new Error('예약 저장 여부를 설정할 세션의 대상 이벤트를 불러올 수 없습니다.');
    }

    const session = await this.getSession(eventId, sid);
    session.saved = saved;
    await this.setSession(eventId, session);
  }

  async emitSession(sid: string) {
    const eventId = await this.getTargetEventId(sid);

    if (eventId === null) {
      return;
    } else if (eventId !== 0) {
      await this.removeInBooking(eventId, sid);
      await this.authService.setUserStatusLogin(sid);
      await this.userService.setUserEventTarget(sid, 0);
    }
  }

  async getInBookingSessionsMaxSize(eventId: number) {
    return parseInt(await this.redis.get(`in-booking:${eventId}:max-size`));
  }

  async getInBookingSessionCount(eventId: number): Promise<number> {
    return this.redis.scard(this.getEventKey(eventId));
  }

  private getTargetEventId(sid: string) {
    return this.userService.getUserEventTarget(sid);
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

  async addReconnectingSession(sid: string) {
    const eventId = await this.userService.getUserEventTarget(sid);
    if (eventId === null) {
      return false;
    }
    const timestamp = Date.now();
    await this.redis.zadd(`reconnecting:${eventId}`, timestamp, sid);
    return true;
  }

  async removeReconnectingSession(sid: string) {
    const eventId = await this.userService.getUserEventTarget(sid);
    if (eventId === null) {
      return false;
    }
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
