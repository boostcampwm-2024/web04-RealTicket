import { RedisService } from '@liaoliaots/nestjs-redis';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Response } from 'express';
import Redis from 'ioredis';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { BehaviorSubject } from 'rxjs';
import { Logger as WinstonLogger } from 'winston';

import { AuthService } from '../../../auth/service/auth.service';
import { AppException } from '../../../common/exception/app.exception';
import { SEATS_BROADCAST_INTERVAL } from '../const/seatsBroadcastInterval.const';
import { SEATS_SSE_RETRY_INTERVAL } from '../const/seatsSseRetryTime.const';
import { SeatStatus } from '../const/seatStatus.enum';
import { SSE_MAXIMUM_INTERVAL } from '../const/sseMaximumInterval';
import { SeatsSseDto } from '../dto/seatsSse.dto';
import { BookingErrorCode } from '../exception/booking-error-code';
import { runGetSeatsLua } from '../luaScripts/getSeatsLua';
import { runInitSectionSeatLua } from '../luaScripts/initSectionSeatLua';
import { runSetSectionsLenLua } from '../luaScripts/setSectionsLenLua';
import { runUpdateSeatLua } from '../luaScripts/updateSeatLua';
import { SseBroadcaster } from '../sse/sse-broadcaster';

import { InBookingService } from './in-booking.service';

type SeatStatusObject = {
  seatStatus: number[][];
};

type SeatSubscription = {
  subject: BehaviorSubject<SeatStatusObject>;
  interval: NodeJS.Timeout;
};

@Injectable()
export class BookingSeatsService implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private readonly pubsubClient: Redis;
  private seatsSubscriptionMap = new Map<number, SeatSubscription>();
  private broadcastActivateMap = new Map<number, boolean>();
  private readonly sseBroadcaster: SseBroadcaster<SeatStatusObject>;
  private readonly ensureSeatSubscriptionPromise = new Map<number, Promise<void>>();
  private readonly PUBSUB_CHANNEL = (eventId: number) => `seats:changes:${eventId}`;

  constructor(
    private redisService: RedisService,
    private readonly authService: AuthService,
    private inBookingService: InBookingService,
    private eventEmitter: EventEmitter2,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {
    this.redis = this.redisService.getOrThrow();
    this.pubsubClient = this.redisService.getOrThrow('pubsub');
    this.sseBroadcaster = new SseBroadcaster('seats', this.logger, { retryMs: SEATS_SSE_RETRY_INTERVAL });

    this.pubsubClient.on('message', (channel: string) => {
      const match = channel.match(/^seats:changes:(\d+)$/);
      if (match) {
        this.broadcastActivateMap.set(parseInt(match[1], 10), true);
      }
    });
  }

  async openReservation(eventId: number, seats: number[][]) {
    seats.forEach((section, sectionIndex) => {
      const seatBitMap = section.map((seat) => seat.toString()).join('');
      const key = `event:${eventId}:section:${sectionIndex}:seats`;
      runInitSectionSeatLua(this.redis, key, seatBitMap);
    });
    await runSetSectionsLenLua(this.redis, eventId, seats.length);

    if (this.seatsSubscriptionMap.has(eventId)) {
      throw new AppException(BookingErrorCode.SEAT_SUBSCRIPTION_EXISTS);
    }
    const seatSubscription = await this.createSeatSubscription(eventId, seats);
    this.seatsSubscriptionMap.set(eventId, seatSubscription);
    await this.pubsubClient.subscribe(this.PUBSUB_CHANNEL(eventId));
    this.sseBroadcaster.startBroadcast(String(eventId), seatSubscription.subject.asObservable());
  }

  async onModuleDestroy() {
    const eventIds = [...this.seatsSubscriptionMap.keys()];
    await Promise.allSettled(eventIds.map((id) => this.clearSeatsSubscription(id)));
  }

  async clearSeatsSubscription(eventId: number) {
    this.sseBroadcaster.stopBroadcast(String(eventId));
    const seatSubscription = this.seatsSubscriptionMap.get(eventId);
    if (seatSubscription) {
      clearInterval(seatSubscription.interval);
      seatSubscription.subject.complete();
      this.seatsSubscriptionMap.delete(eventId);
    }
    this.broadcastActivateMap.delete(eventId);
    await this.pubsubClient.unsubscribe(this.PUBSUB_CHANNEL(eventId));
    const keys = await this.redis.keys(`event:${eventId}:*`);
    if (keys.length > 0) {
      await this.redis.unlink(...keys);
    }
  }

  async bookSeat(sid: string, target: [number, number]) {
    const eventId = await this.authService.getUserEventTarget(sid);

    if (eventId === null) {
      throw new AppException(BookingErrorCode.SESSION_EVENT_NOT_FOUND);
    }

    await this.inBookingService.validateAndAddBookedSeat(eventId, sid, target);

    try {
      return await this.updateSeatReserved(eventId, target);
    } catch (error) {
      await this.inBookingService.removeBookedSeat(eventId, sid, target);
      throw error;
    }
  }

  async unBookSeat(sid: string, target: [number, number]) {
    const eventId = await this.authService.getUserEventTarget(sid);

    if (eventId === null) {
      throw new AppException(BookingErrorCode.SESSION_EVENT_NOT_FOUND);
    }

    await this.inBookingService.validateAndRemoveBookedSeat(eventId, sid, target);

    try {
      return await this.updateSeatDeleted(eventId, target);
    } catch (error) {
      await this.inBookingService.addBookedSeat(eventId, sid, target);
      throw error;
    }
  }

  async updateSeatReserved(eventId: number, target: [number, number]) {
    const [sectionIndex, seatIndex] = target;
    const key = `event:${eventId}:section:${sectionIndex}:seats`;

    const result = await runUpdateSeatLua(this.redis, key, seatIndex, 0);

    if (result === 'nil') {
      throw new AppException(BookingErrorCode.SEAT_NOT_FOUND);
    } else if (result === 0) {
      throw new AppException(BookingErrorCode.SEAT_ALREADY_RESERVED);
    } else {
      await this.redis.publish(this.PUBSUB_CHANNEL(eventId), String(eventId));
      return {
        eventId,
        sectionIndex,
        seatIndex,
        acceptedStatus: SeatStatus.RESERVE,
      };
    }
  }

  async updateSeatDeleted(eventId: number, target: [number, number]) {
    const [sectionIndex, seatIndex] = target;
    const key = `event:${eventId}:section:${sectionIndex}:seats`;

    const result = await runUpdateSeatLua(this.redis, key, seatIndex, 1);

    if (result === 'nil') {
      throw new AppException(BookingErrorCode.SEAT_NOT_FOUND);
    } else if (result === 0) {
      throw new AppException(BookingErrorCode.SEAT_ALREADY_CANCELLED);
    } else {
      await this.redis.publish(this.PUBSUB_CHANNEL(eventId), String(eventId));
      return {
        eventId,
        sectionIndex,
        seatIndex,
        acceptedStatus: SeatStatus.DELETE,
      };
    }
  }

  async getSeats(eventId: number) {
    const seatStatusBits = await runGetSeatsLua(this.redis, eventId);
    if (!seatStatusBits) {
      throw new AppException(BookingErrorCode.SEAT_FETCH_FAILED);
    }
    return seatStatusBits;
  }

  getSeatsObservable(eventId: number) {
    const subscription = this.seatsSubscriptionMap.get(eventId);
    if (!subscription) {
      throw new AppException(BookingErrorCode.SEAT_SUBSCRIPTION_NOT_FOUND);
    }
    return subscription.subject.asObservable();
  }

  async addSseClient(eventId: number, res: Response, sid: string): Promise<void> {
    if (!this.seatsSubscriptionMap.has(eventId)) {
      await this.ensureSeatSubscription(eventId);
    }
    this.sseBroadcaster.addClient(String(eventId), res, sid);
  }

  removeSseClient(eventId: number, res: Response): void {
    this.sseBroadcaster.removeClient(String(eventId), res);
  }

  private async ensureSeatSubscription(eventId: number): Promise<void> {
    if (this.seatsSubscriptionMap.has(eventId)) return;

    if (!this.ensureSeatSubscriptionPromise.has(eventId)) {
      const promise = this._doEnsureSeatSubscription(eventId).finally(() => {
        this.ensureSeatSubscriptionPromise.delete(eventId);
      });
      this.ensureSeatSubscriptionPromise.set(eventId, promise);
    }

    return this.ensureSeatSubscriptionPromise.get(eventId);
  }

  private async _doEnsureSeatSubscription(eventId: number): Promise<void> {
    if (this.seatsSubscriptionMap.has(eventId)) return;

    let initialSeats: number[][];
    try {
      initialSeats = await this.getSeats(eventId);
    } catch {
      this.logger.warn(`[seats] lazy init 실패: eventId=${eventId} — Redis에 좌석 데이터 없음`);
      return;
    }

    const seatSubscription = await this.createSeatSubscription(eventId, initialSeats);
    this.seatsSubscriptionMap.set(eventId, seatSubscription);
    await this.pubsubClient.subscribe(this.PUBSUB_CHANNEL(eventId));
    this.sseBroadcaster.startBroadcast(String(eventId), seatSubscription.subject.asObservable());
  }

  private unActivateNextBroadcast = (eventId: number) => {
    this.broadcastActivateMap.set(eventId, false);
  };

  private isBroadcastActivated = (eventId: number) => {
    return this.broadcastActivateMap.get(eventId);
  };

  private async createSeatSubscription(eventId: number, initialSeats: number[][]): Promise<SeatSubscription> {
    const subject = new BehaviorSubject<SeatStatusObject>({ seatStatus: initialSeats });
    let lastBroadcastTime = Date.now();

    const interval = setInterval(
      async () => {
        const now = Date.now();
        const timeSinceLastBroadcast = now - lastBroadcastTime;

        if (timeSinceLastBroadcast >= SSE_MAXIMUM_INTERVAL || this.isBroadcastActivated(eventId)) {
          try {
            const seats = await this.getSeats(eventId);
            subject.next(new SeatsSseDto(seats));
            lastBroadcastTime = Date.now();

            if (this.isBroadcastActivated(eventId)) {
              this.unActivateNextBroadcast(eventId);
            }
          } catch (error) {
            this.logger.error(`좌석 브로드캐스트 실패: eventId=${eventId}`, error);
          }
        }
      },
      Math.min(SEATS_BROADCAST_INTERVAL, SSE_MAXIMUM_INTERVAL),
    );

    return { subject, interval };
  }

  @OnEvent('logout-release-seats')
  async handleLogoutReleaseSeats(payload: { sid: string; eventId: number; bookedSeats: [number, number][] }) {
    try {
      const { sid, eventId, bookedSeats } = payload;

      for (const seat of bookedSeats) {
        try {
          await this.updateSeatDeleted(eventId, seat);
        } catch (error) {
          this.logger.warn(
            `(로그아웃) 좌석 방출 실패: [${seat[0]}, ${seat[1]}], SID: ${sid}, ${error.message}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`(로그아웃) 좌석 방출 실패: ${error.message}`, error.stack);
    }
  }
}
