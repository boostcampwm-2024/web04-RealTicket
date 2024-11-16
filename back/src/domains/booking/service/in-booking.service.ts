import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
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
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async insertInBooking(sid: string): Promise<boolean> {
    const eventId = await this.getTargetEventId(sid);
    const session: InBookingSession = {
      sid,
      bookingAmount: 0,
      bookedSeats: [],
    };
    await this.setSession(eventId, session);
    return true;
  }

  async removeInBooking(sid: string): Promise<void> {
    const eventId = await this.getTargetEventId(sid);
    const session = await this.getSession(eventId, sid);
    if (session) {
      await this.redis.del(this.getSessionKey(eventId, sid));
      await this.redis.srem(this.getEventKey(eventId), sid);
    }
  }

  async setBookingAmount(sid: string, amount: number): Promise<void> {
    const eventId = await this.getTargetEventId(sid);
    const session = await this.getSession(eventId, sid);

    session.bookingAmount = amount;
    await this.setSession(eventId, session);
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
}
