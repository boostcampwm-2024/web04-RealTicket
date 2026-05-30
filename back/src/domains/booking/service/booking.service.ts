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
    const isQueueEmpty = async (eventId: number) =>
      (await this.waitingQueueService.getQueueSize(eventId)) < 1;
    while (!(await isQueueEmpty(eventId)) && (await this.isInsertableInBooking(eventId))) {
      const item = await this.getWaitingHead(eventId);
      if (!item) {
        break;
      }

      const result = await this.authService.enterBookingGate(item.sid, eventId, {
        watchKeys: [...this.getAdmissionWatchKeys(eventId), this.getWaitingQueueKey(eventId)],
        validate: async (redis, context) => {
          if (!this.isSessionTargetingEvent(context, eventId)) {
            return false;
          }

          const head = await redis.lindex(this.getWaitingQueueKey(eventId), 0);
          if (!head) {
            return false;
          }

          const parsed = JSON.parse(head);
          return parsed?.sid === item.sid && (await this.isInsertableInBookingWithRedis(redis, eventId));
        },
        mutate: (multi) => {
          multi.lpop(this.getWaitingQueueKey(eventId));
          multi.zadd(this.getEnteringKey(eventId), Date.now(), item.sid);
        },
      });

      if (result?.ok) {
        continue;
      }

      if (result && !result.ok) {
        await this.waitingQueueService.popQueue(eventId);
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
    const reconnectingKey = this.getReconnectingKey(eventId);
    const result = await this.authService.restoreSeatSelection(sid, {
      watchKeys: [reconnectingKey],
      validate: async (redis, context) =>
        this.isSessionTargetingEvent(context, eventId) && (await redis.zscore(reconnectingKey, sid)) !== null,
      mutate: (multi) => {
        multi.zrem(reconnectingKey, sid);
      },
    });

    if (!result?.ok) {
      throw new AppException(BookingErrorCode.INVALID_STATE);
    }
  }

  async markReconnectingFromSeat(eventId: number, sid: string): Promise<boolean> {
    const reconnectingKey = this.getReconnectingKey(eventId);
    const result = await this.authService.markReconnectingSelection(sid, {
      watchKeys: [reconnectingKey],
      validate: (_redis, context) => this.isSessionTargetingEvent(context, eventId),
      mutate: (multi) => {
        multi.zadd(reconnectingKey, Date.now(), sid);
      },
    });

    return !!result?.ok;
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

    if (enteringResult === 'rejected' || enteringResult === 'lost') {
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

  private async isInsertableInBooking(eventId: number): Promise<boolean> {
    return this.isInsertableInBookingWithRedis(this.redis, eventId);
  }

  private async tryEnterBookingGate(
    eventId: number,
    sid: string,
  ): Promise<'entered' | 'full' | 'rejected' | 'lost'> {
    let validationRan = false;
    let capacityAvailable = false;

    const result = await this.authService.enterBookingGate(sid, eventId, {
      watchKeys: this.getAdmissionWatchKeys(eventId),
      validate: async (redis) => {
        validationRan = true;
        capacityAvailable = await this.isInsertableInBookingWithRedis(redis, eventId);
        return capacityAvailable;
      },
      mutate: (multi) => {
        multi.zadd(this.getEnteringKey(eventId), Date.now(), sid);
      },
    });

    if (result?.ok) {
      return 'entered';
    }

    if (result && !result.ok) {
      return 'rejected';
    }

    return validationRan && !capacityAvailable ? 'full' : 'lost';
  }

  private async tryEnterWaitingQueue(eventId: number, sid: string): Promise<number | null> {
    const orderKey = this.getWaitingOrderKey(eventId);
    const queueKey = this.getWaitingQueueKey(eventId);
    let nextOrder: number | null = null;

    const result = await this.authService.enterWaiting(sid, eventId, {
      watchKeys: [queueKey, orderKey],
      validate: async (redis) => {
        const rawOrder = await redis.get(orderKey);
        nextOrder = rawOrder ? parseInt(rawOrder) + 1 : 1;
        return Number.isFinite(nextOrder);
      },
      mutate: (multi) => {
        multi.set(orderKey, nextOrder);
        multi.rpush(queueKey, JSON.stringify({ sid, order: nextOrder }));
      },
    });

    return result?.ok ? nextOrder : null;
  }

  private async isInsertableInBookingWithRedis(redis: Redis, eventId: number): Promise<boolean> {
    const inBookingCount = await redis.hlen(this.getInBookingSessionsKey(eventId));
    const inBookingReconnectingCount = await redis.zcard(this.getReconnectingKey(eventId));
    const enteringCount = await redis.zcard(this.getEnteringKey(eventId));
    const maxSize = await this.getInBookingSessionsMaxSizeWithRedis(redis, eventId);
    return inBookingCount + inBookingReconnectingCount + enteringCount < maxSize;
  }

  private async getInBookingSessionsMaxSizeWithRedis(redis: Redis, eventId: number): Promise<number> {
    const raw = await redis.get(this.getInBookingMaxSizeKey(eventId));
    if (raw) {
      return parseInt(raw);
    }

    const defaultRaw = await redis.get('in-booking:default-max-size');
    return defaultRaw ? parseInt(defaultRaw) : IN_BOOKING_DEFAULT_MAX_SIZE;
  }

  private getAdmissionWatchKeys(eventId: number): string[] {
    return [
      this.getEnteringKey(eventId),
      this.getInBookingSessionsKey(eventId),
      this.getReconnectingKey(eventId),
      this.getInBookingMaxSizeKey(eventId),
      'in-booking:default-max-size',
    ];
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

  private async getWaitingHead(eventId: number): Promise<{ sid: string; order: number } | null> {
    const item = await this.redis.lindex(this.getWaitingQueueKey(eventId), 0);
    return item ? JSON.parse(item) : null;
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
