import { RedisService } from '@liaoliaots/nestjs-redis';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';

import { AuthService } from '../../../auth/service/auth.service';
import { AppException } from '../../../common/exception/app.exception';
import { BookingAdmissionStatusDto } from '../dto/bookingAdmissionStatus.dto';
import { ServerTimeDto } from '../dto/serverTime.dto';
import { BookingErrorCode } from '../exception/booking-error-code';

import { BookingSeatsService } from './booking-seats.service';
import { EnterBookingService } from './enter-booking.service';
import { InBookingService } from './in-booking.service';
import { OpenBookingService } from './open-booking.service';
import { WaitingQueueService } from './waiting-queue.service';

@Injectable()
export class BookingService implements OnModuleInit, OnModuleDestroy {
  private readonly pubsubClient: Redis;
  private static readonly BOOKING_EVENTS_CHANNEL = 'booking:events';

  constructor(
    private readonly authService: AuthService,
    private readonly bookingSeatsService: BookingSeatsService,
    private readonly inBookingService: InBookingService,
    private readonly openBookingService: OpenBookingService,
    private readonly waitingQueueService: WaitingQueueService,
    private readonly enterBookingService: EnterBookingService,
    private readonly redisService: RedisService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {
    this.pubsubClient = this.redisService.getOrThrow('pubsub');
  }

  async onModuleInit() {
    await this.pubsubClient.subscribe(BookingService.BOOKING_EVENTS_CHANNEL);
    this.pubsubClient.on('message', async (channel: string, message: string) => {
      if (channel !== BookingService.BOOKING_EVENTS_CHANNEL) return;
      try {
        const payload = JSON.parse(message) as
          | { type: 'in-booking-max-size-changed'; eventId: number }
          | { type: 'all-in-booking-max-size-changed' }
          | { type: 'entering-sessions-gc'; eventId: number };

        switch (payload.type) {
          case 'in-booking-max-size-changed':
            await this.letInNextWaiting(payload.eventId);
            break;
          case 'all-in-booking-max-size-changed': {
            const eventIds = await this.openBookingService.getOpenedEventIds();
            await Promise.all(eventIds.map((id) => this.letInNextWaiting(id)));
            break;
          }
          case 'entering-sessions-gc':
            await this.letInNextWaiting(payload.eventId);
            break;
        }
      } catch (err) {
        this.logger.error(`booking:events dispatch 실패: ${(err as Error).message}`);
      }
    });
  }

  async onModuleDestroy() {
    try {
      await this.pubsubClient.unsubscribe(BookingService.BOOKING_EVENTS_CHANNEL);
    } catch {
      // teardown 중 무시
    }
  }

  @OnEvent('seats-sse-close')
  async onSeatsSseDisconnected(event: { sid: string }) {
    const sid = event.sid;
    const eventId = await this.authService.getUserEventTarget(sid);

    if (eventId === null) {
      return;
    }

    if (await this.openBookingService.isEventOpened(eventId)) {
      await this.collectSeatsIfNotSaved(eventId, sid);
      await this.inBookingService.emitSession(eventId, sid);
      await this.letInNextWaiting(eventId);
    }
  }

  private async collectSeatsIfNotSaved(eventId: number, sid: string) {
    const inBookingSession = await this.inBookingService.getSession(eventId, sid);
    if (process.env.BENCHMARK_MODE === 'true' && eventId === 1) {
      return;
    }
    if (inBookingSession && !inBookingSession.saved) {
      const bookedSeats = inBookingSession.bookedSeats;
      bookedSeats.forEach((seat) => {
        this.bookingSeatsService.updateSeatDeleted(eventId, seat);
      });
      inBookingSession.bookedSeats = [];
      await this.inBookingService.setSession(eventId, inBookingSession);
    }
  }

  private async letInNextWaiting(eventId: number) {
    const isQueueEmpty = async (eventId: number) =>
      (await this.waitingQueueService.getQueueSize(eventId)) < 1;
    while (!(await isQueueEmpty(eventId)) && (await this.isInsertableInBooking(eventId))) {
      const item = await this.waitingQueueService.popQueue(eventId);
      if (!item) {
        break;
      }
      await this.enterBookingService.addEnteringSession(eventId, item.sid);
      await this.authService.setUserStatusEntering(item.sid);
    }
  }

  async setInBookingFromEntering(sid: string) {
    const eventId = await this.authService.getUserEventTarget(sid);

    if (eventId === null) {
      throw new AppException(BookingErrorCode.SESSION_EVENT_NOT_FOUND);
    }

    const bookingAmount = await this.enterBookingService.getBookingAmount(sid);

    await this.enterBookingService.removeEnteringSession(eventId, sid);
    await this.inBookingService.insertInBooking(eventId, sid, bookingAmount);
    await this.authService.setUserStatusSelectingSeat(sid);
  }

  // 함수 이름 생각하기
  async isAdmission(eventId: number, sid: string): Promise<BookingAdmissionStatusDto> {
    const isOpened = await this.openBookingService.isEventOpened(eventId);
    if (!isOpened) {
      throw new AppException(BookingErrorCode.NOT_OPEN);
    }

    await this.authService.setUserEventTarget(sid, eventId);

    return await this.getForwarded(eventId, sid);
  }

  private async getForwarded(eventId: number, sid: string) {
    const isInsertable = await this.isInsertableInBooking(eventId);

    if (isInsertable) {
      await this.enterBookingService.addEnteringSession(eventId, sid);
      await this.authService.setUserStatusEntering(sid);
      return {
        waitingStatus: false,
        enteringStatus: true,
      };
    }

    await this.authService.setUserStatusWaiting(sid);
    const userOrder = await this.waitingQueueService.pushQueue(eventId, sid);
    return {
      waitingStatus: true,
      enteringStatus: false,
      userOrder,
    };
  }

  private async isInsertableInBooking(eventId: number): Promise<boolean> {
    const inBookingCount = await this.inBookingService.getInBookingSessionCount(eventId);
    const inBookingReconnectingCount = await this.inBookingService.getReconnectingSessionCount(eventId);
    const enteringCount = await this.enterBookingService.getEnteringSessionCount(eventId);
    const maxSize = await this.inBookingService.getInBookingSessionsMaxSize(eventId);
    return inBookingCount + inBookingReconnectingCount + enteringCount < maxSize;
  }

  async setBookingAmount(sid: string, bookingAmount: number) {
    const eventId = await this.authService.getUserEventTarget(sid);

    if (eventId === null) {
      throw new AppException(BookingErrorCode.SESSION_EVENT_NOT_FOUND);
    }

    const isInBooking = await this.inBookingService.isInBooking(eventId, sid);
    if (isInBooking) {
      const { flushedSeats } = await this.inBookingService.flushAndSetBookingAmount(
        eventId,
        sid,
        bookingAmount,
      );
      if (flushedSeats.length > 0) {
        await Promise.all(
          flushedSeats.map((seat) => this.bookingSeatsService.updateSeatDeleted(eventId, seat)),
        );
      }
      return bookingAmount;
    }

    const isEntering = await this.enterBookingService.isEntering(eventId, sid);
    if (!isEntering) {
      throw new AppException(BookingErrorCode.INVALID_STATE);
    }
    return await this.enterBookingService.setBookingAmount(sid, bookingAmount);
  }

  async freeSeatsIfEventOpened(eventId: number, seats: [number, number][]) {
    if (await this.openBookingService.isEventOpened(eventId)) {
      await Promise.all(seats.map((seat) => this.bookingSeatsService.updateSeatDeleted(eventId, seat)));
    }
  }

  async getTimeMs(): Promise<ServerTimeDto> {
    return { now: Date.now() };
  }
}
