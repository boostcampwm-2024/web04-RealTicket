import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import Redis from 'ioredis';

import { AuthService } from '../../../auth/service/auth.service';
import { IN_BOOKING_POOL_SIZE } from '../const/inBookingPoolSize.const';

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
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  @OnEvent('seats-sse-close')
  async onSeatsSseDisconnect(event: { sid: string }) {
    const sid = event.sid;
    const eventId = await this.getTargetEventId(sid);
    await this.removeInBooking(eventId, sid);
    await this.authService.setUserStatusLogin(sid);
  }

  async insertIfPossible(sid: string): Promise<boolean> {
    const eventId = await this.getTargetEventId(sid);
    const isInsertable = await this.isInsertable(eventId);
    if (isInsertable) {
      await this.insertInBooking(eventId, sid);
      return true;
    }
    return false;
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

  private async isInsertable(eventId: number): Promise<boolean> {
    const size = await this.getInBookingSessionsSize(eventId);
    return size < IN_BOOKING_POOL_SIZE;
  }

  private async insertInBooking(eventId: number, sid: string): Promise<boolean> {
    const session: InBookingSession = {
      sid,
      bookingAmount: 0,
      bookedSeats: [],
    };
    await this.setSession(eventId, session);
    return true;
  }

  private async removeInBooking(eventId: number, sid: string): Promise<void> {
    const session = await this.getSession(eventId, sid);
    if (session) {
      await this.redis.del(this.getSessionKey(eventId, sid));
      await this.redis.srem(this.getEventKey(eventId), sid);
    }
  }

  private async getInBookingSessionsSize(eventId: number): Promise<number> {
    return this.redis.scard(this.getEventKey(eventId));
  }
}
