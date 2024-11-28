import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';

import { AuthService } from '../../../auth/service/auth.service';

type InBookingSession = {
  sid: string;
  bookingAmount: number;
  bookedSeats: [number, number][];
};

@Injectable()
export class InBookingService {
  private readonly redis: Redis | null;
  constructor(
    private readonly authService: AuthService,
    private redisService: RedisService,
    private eventEmitter: EventEmitter2,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async getInBookingSessionsDefaultMaxSize() {
    return parseInt(await this.redis.get('in-booking:default-max-size'));
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
    const session = await this.getSession(eventId, sid);
    return !!session;
  }

  async insertInBooking(eventId: number, sid: string, bookingAmount: number = 0): Promise<boolean> {
    const session: InBookingSession = {
      sid,
      bookingAmount,
      bookedSeats: [],
    };
    await this.setSession(eventId, session);
    return true;
  }

  async setBookingAmount(sid: string, amount: number): Promise<number> {
    const eventId = await this.getTargetEventId(sid);
    const session = await this.getSession(eventId, sid);

    session.bookingAmount = amount;
    await this.setSession(eventId, session);

    return amount;
  }

  async getBookingAmount(sid: string): Promise<number> {
    const eventId = await this.getTargetEventId(sid);
    const session = await this.getSession(eventId, sid);
    return session.bookingAmount;
  }

  async addBookedSeat(sid: string, seat: [number, number]): Promise<void> {
    const eventId = await this.getTargetEventId(sid);
    const session = await this.getSession(eventId, sid);
    session.bookedSeats.push(seat);
    await this.setSession(eventId, session);
  }

  async getBookedSeats(sid: string): Promise<[number, number][]> {
    const eventId = await this.getTargetEventId(sid);
    const session = await this.getSession(eventId, sid);
    return session.bookedSeats;
  }

  async removeBookedSeat(sid: string, seat: [number, number]): Promise<void> {
    const eventId = await this.getTargetEventId(sid);
    const session = await this.getSession(eventId, sid);
    session.bookedSeats = session.bookedSeats.filter((s) => s[0] !== seat[0] || s[1] !== seat[1]);
    await this.setSession(eventId, session);
  }

  async emitSession(sid: string) {
    const eventId = await this.getTargetEventId(sid);
    await this.removeInBooking(eventId, sid);
    await this.authService.setUserStatusLogin(sid);
    await this.authService.setUserEventTarget(sid, 0);
  }

  async getInBookingSessionsMaxSize(eventId: number) {
    return parseInt(await this.redis.get(`in-booking:${eventId}:max-size`));
  }

  async getInBookingSessionCount(eventId: number): Promise<number> {
    return this.redis.scard(this.getEventKey(eventId));
  }

  private getTargetEventId(sid: string) {
    return this.authService.getUserEventTarget(sid);
  }

  private getSessionKey(eventId: number, sid: string) {
    return `in-booking:${eventId}:session:${sid}`;
  }

  private getEventKey(eventId: number) {
    return `in-booking:${eventId}:sessions`;
  }

  private async setSession(eventId: number, inBookingSession: InBookingSession): Promise<void> {
    const sessionKey = this.getSessionKey(eventId, inBookingSession.sid);
    const eventKey = this.getEventKey(eventId);

    await this.redis.sadd(eventKey, inBookingSession.sid);
    await this.redis.set(sessionKey, JSON.stringify(inBookingSession));
  }

  private async getSession(eventId: number, sid: string): Promise<InBookingSession | null> {
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
}
