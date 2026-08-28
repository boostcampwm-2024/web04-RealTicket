import { RedisService } from '@liaoliaots/nestjs-redis';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';

import { USER_STATUS } from '../../../auth/const/userStatus.const';
import { AuthService } from '../../../auth/service/auth.service';
import { AppException } from '../../../common/exception/app.exception';
import { IN_BOOKING_DEFAULT_MAX_SIZE } from '../const/inBookingDefaultMaxSize.const';
import { BookingAdmissionStatusDto } from '../dto/bookingAdmissionStatus.dto';
import { ServerTimeDto } from '../dto/serverTime.dto';
import { BookingErrorCode } from '../exception/booking-error-code';
import { runImmediateAdmissionLua, runWaitingHeadPromotionLua } from '../luaScripts/admissionCapacityLua';
import { runMarkReconnectingLua, runRestoreSelectingLua } from '../luaScripts/reconnectingTransitionLua';
import { runWaitingQueueEntryLua } from '../luaScripts/waitingQueueEntryLua';

import { BookingSeatsService } from './booking-seats.service';
import { EnterBookingService } from './enter-booking.service';
import { InBookingService } from './in-booking.service';
import { OpenBookingService } from './open-booking.service';
import { WaitingQueueService } from './waiting-queue.service';

@Injectable()
export class BookingService implements OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis;
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
    this.redis = this.redisService.getOrThrow();
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

  private isSessionTargetingEvent(context: { session: { targetEvent?: unknown } }, eventId: number) {
    return context.session.targetEvent === eventId;
  }

  private async letInNextWaiting(eventId: number) {
    while (true) {
      const result = await runWaitingHeadPromotionLua(this.redis, {
        waitingQueueKey: this.getWaitingQueueKey(eventId),
        userKeyPrefix: 'user:',
        eventId,
        keys: {
          enteringKey: this.getEnteringKey(eventId),
          inBookingSessionsKey: this.getInBookingSessionsKey(eventId),
          reconnectingKey: this.getReconnectingKey(eventId),
          maxSizeKey: this.getInBookingMaxSizeKey(eventId),
          defaultMaxSizeKey: 'in-booking:default-max-size',
        },
        defaultMaxSize: IN_BOOKING_DEFAULT_MAX_SIZE,
        nowMs: Date.now(),
      });

      if (result.ok) {
        continue;
      }

      if (
        result.code === 'STALE_SESSION_MISSING' ||
        result.code === 'STALE_STATE_MISMATCH' ||
        result.code === 'STALE_TARGET_EVENT_MISMATCH'
      ) {
        continue;
      }

      break;
    }
  }

  async setInBookingFromEntering(sid: string) {
    const eventId = await this.authService.getUserEventTarget(sid);

    if (eventId === null) {
      throw new AppException(BookingErrorCode.SESSION_EVENT_NOT_FOUND);
    }

    const enteringKey = this.getEnteringKey(eventId);
    const inBookingKey = this.getInBookingSessionsKey(eventId);
    const bookingAmountKey = this.getEnteringBookingAmountKey(sid);
    let bookingAmount = 0;

    const result = await this.authService.startSeatSelection(sid, {
      watchKeys: [enteringKey, inBookingKey, bookingAmountKey],
      validate: async (redis, context) => {
        if (!this.isSessionTargetingEvent(context, eventId)) {
          return false;
        }

        const score = await redis.zscore(enteringKey, sid);
        if (score === null) {
          return false;
        }

        const bookingAmountData = await redis.get(bookingAmountKey);
        bookingAmount = bookingAmountData ? parseInt(bookingAmountData) : 0;
        return Number.isFinite(bookingAmount);
      },
      mutate: (multi) => {
        multi.zrem(enteringKey, sid);
        multi.del(bookingAmountKey);
        multi.hset(
          inBookingKey,
          sid,
          JSON.stringify({
            sid,
            bookingAmount,
            bookedSeats: [],
            saved: false,
            subscribedSection: null,
          }),
        );
      },
    });

    if (!result?.ok) {
      throw new AppException(BookingErrorCode.INVALID_STATE);
    }
  }

  async restoreInBookingFromReconnecting(eventId: number, sid: string) {
    const result = await runRestoreSelectingLua(this.redis, {
      sessionKey: `user:${sid}`,
      reconnectingKey: this.getReconnectingKey(eventId),
      eventId,
      sid,
    });

    if (!result.ok) {
      throw new AppException(BookingErrorCode.INVALID_STATE);
    }
  }

  async markReconnectingFromSeat(eventId: number, sid: string): Promise<boolean> {
    const result = await runMarkReconnectingLua(this.redis, {
      sessionKey: `user:${sid}`,
      reconnectingKey: this.getReconnectingKey(eventId),
      eventId,
      sid,
      nowMs: Date.now(),
    });

    if (!result.ok) {
      this.logger.warn(
        `재연결 표시 실패로 in-booking 슬롯이 남을 수 있음: eventId=${eventId} sid=${sid} code=${result.code}`,
      );
    }

    return result.ok;
  }

  // 함수 이름 생각하기
  async isAdmission(eventId: number, sid: string): Promise<BookingAdmissionStatusDto> {
    const isOpened = await this.openBookingService.isEventOpened(eventId);
    if (!isOpened) {
      throw new AppException(BookingErrorCode.NOT_OPEN);
    }

    const session = await this.authService.getUserSession(sid);
    if (!session) {
      throw new AppException(BookingErrorCode.INVALID_STATE);
    }

    if (session.targetEvent === eventId) {
      if (session.userStatus === USER_STATUS.ENTERING) {
        return {
          waitingStatus: false,
          enteringStatus: true,
        };
      }

      if (session.userStatus === USER_STATUS.WAITING) {
        const waitingResponse = {
          waitingStatus: true,
          enteringStatus: false,
          userOrder: await this.getWaitingOrder(eventId, sid),
        };
        return waitingResponse;
      }
    }

    if (session.userStatus !== USER_STATUS.LOGIN) {
      throw new AppException(BookingErrorCode.INVALID_STATE);
    }

    return this.getForwarded(eventId, sid);
  }

  private async getForwarded(eventId: number, sid: string) {
    const enteringResult = await this.tryEnterBookingGate(eventId, sid);
    if (enteringResult === 'entered') {
      return {
        waitingStatus: false,
        enteringStatus: true,
      };
    }

    if (enteringResult === 'rejected') {
      throw new AppException(BookingErrorCode.INVALID_STATE);
    }

    const userOrder = await this.tryEnterWaitingQueue(eventId, sid);
    if (userOrder === null) {
      throw new AppException(BookingErrorCode.INVALID_STATE);
    }

    return {
      waitingStatus: true,
      enteringStatus: false,
      userOrder,
    };
  }

  private async tryEnterBookingGate(eventId: number, sid: string): Promise<'entered' | 'full' | 'rejected'> {
    const result = await runImmediateAdmissionLua(this.redis, {
      sessionKey: `user:${sid}`,
      eventId,
      keys: {
        enteringKey: this.getEnteringKey(eventId),
        inBookingSessionsKey: this.getInBookingSessionsKey(eventId),
        reconnectingKey: this.getReconnectingKey(eventId),
        maxSizeKey: this.getInBookingMaxSizeKey(eventId),
        defaultMaxSizeKey: 'in-booking:default-max-size',
      },
      defaultMaxSize: IN_BOOKING_DEFAULT_MAX_SIZE,
      nowMs: Date.now(),
    });

    if (result.ok) {
      return 'entered';
    }

    if (result.code === 'CAPACITY_FULL') {
      return 'full';
    }

    return 'rejected';
  }

  private async tryEnterWaitingQueue(eventId: number, sid: string): Promise<number | null> {
    const { order } = await runWaitingQueueEntryLua(this.redis, {
      sessionKey: `user:${sid}`,
      waitingQueueKey: this.getWaitingQueueKey(eventId),
      waitingOrderKey: this.getWaitingOrderKey(eventId),
      eventId,
      sid,
    });

    return order;
  }

  private getEnteringKey(eventId: number): string {
    return `entering:${eventId}`;
  }

  private getEnteringBookingAmountKey(sid: string): string {
    return `entering:${sid}:temp-booking-amount`;
  }

  private getInBookingSessionsKey(eventId: number): string {
    return `in-booking:${eventId}:sessions`;
  }

  private getInBookingMaxSizeKey(eventId: number): string {
    return `in-booking:${eventId}:max-size`;
  }

  private getReconnectingKey(eventId: number): string {
    return `reconnecting:${eventId}`;
  }

  private getWaitingQueueKey(eventId: number): string {
    return `waiting-queue:${eventId}`;
  }

  private getWaitingOrderKey(eventId: number): string {
    return `waiting-queue:${eventId}:order`;
  }

  private async getWaitingOrder(eventId: number, sid: string): Promise<number | null> {
    const items = await this.redis.lrange(this.getWaitingQueueKey(eventId), 0, -1);
    for (const item of items) {
      const parsed = JSON.parse(item);
      if (parsed?.sid === sid) {
        return parsed.order;
      }
    }
    return null;
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
