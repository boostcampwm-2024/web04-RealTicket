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
import { OccupiedSeatsSseDto, SeatsSseDto, SeatsSsePayloadDto } from '../dto/seatsSse.dto';
import { BookingErrorCode } from '../exception/booking-error-code';
import { runGetSectionSeatsLua } from '../luaScripts/getSeatsLua';
import { runInitSectionSeatLua } from '../luaScripts/initSectionSeatLua';
import { runSetSectionsLenLua } from '../luaScripts/setSectionsLenLua';
import { runUpdateSeatLua } from '../luaScripts/updateSeatLua';
import { SseBroadcaster } from '../sse/sse-broadcaster';

import { InBookingService } from './in-booking.service';

type SeatSubscription = {
  subject: BehaviorSubject<SeatsSseDto>;
  interval: NodeJS.Timeout;
};

type RemoveSseClientOptions = {
  expectedSeq?: number;
  sectionIndex: number | null;
};

type RemoveSseClientResult = {
  removed: boolean;
  activeConnectionClosed: boolean;
  saved: boolean;
};

@Injectable()
export class BookingSeatsService implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private readonly pubsubClient: Redis;
  private seatsSubscriptionMap = new Map<string, SeatSubscription>();
  private broadcastActivateMap = new Map<string, boolean>();
  private readonly sseBroadcaster: SseBroadcaster<SeatsSseDto>;
  private readonly ensureSeatSubscriptionPromise = new Map<string, Promise<void>>();

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
      const match = channel.match(/^seats:changes:(\d+):(\d+)$/);
      if (match) {
        const key = `${match[1]}:${match[2]}`;
        this.broadcastActivateMap.set(key, true);
      }
    });
  }

  async openReservation(eventId: number, seats: number[][], reservedSeats: [number, number][] = []) {
    const seatsCopy = seats.map((s) => [...s]);
    for (const [secIdx, seatIdx] of reservedSeats) {
      if (seatsCopy[secIdx] && seatIdx >= 0 && seatIdx < seatsCopy[secIdx].length) {
        seatsCopy[secIdx][seatIdx] = 0;
      }
    }

    for (let sectionIndex = 0; sectionIndex < seatsCopy.length; sectionIndex++) {
      const section = seatsCopy[sectionIndex];
      const seatBitMap = section.map((seat) => seat.toString()).join('');
      const key = `event:${eventId}:section:${sectionIndex}:seats`;
      await runInitSectionSeatLua(this.redis, key, seatBitMap);
    }
    await runSetSectionsLenLua(this.redis, eventId, seatsCopy.length);

    // 이미 구독 중인 섹션이 있으면 기존 구독 정리 (재초기화 지원)
    const existingPrefix = `${eventId}:`;
    const existingKeys = Array.from(this.seatsSubscriptionMap.keys()).filter((k) =>
      k.startsWith(existingPrefix),
    );
    if (existingKeys.length > 0) {
      await this.clearSeatsSubscription(eventId);
    }

    for (let sectionIndex = 0; sectionIndex < seatsCopy.length; sectionIndex++) {
      const key = `${eventId}:${sectionIndex}`;
      const seatSubscription = await this.createSeatSubscription(
        key,
        eventId,
        sectionIndex,
        seatsCopy[sectionIndex],
      );
      this.seatsSubscriptionMap.set(key, seatSubscription);
      await this.pubsubClient.subscribe(`seats:changes:${eventId}:${sectionIndex}`);
      this.sseBroadcaster.startBroadcast(key, seatSubscription.subject.asObservable());
    }
  }

  async attachSubscriptionsForExistingEvent(eventId: number, sectionsLen: number) {
    const existingPrefix = `${eventId}:`;
    const existingKeys = Array.from(this.seatsSubscriptionMap.keys()).filter((k) =>
      k.startsWith(existingPrefix),
    );
    if (existingKeys.length > 0) {
      return;
    }

    for (let sectionIndex = 0; sectionIndex < sectionsLen; sectionIndex++) {
      let initialSeats: number[];
      try {
        initialSeats = await runGetSectionSeatsLua(this.redis, eventId, sectionIndex);
      } catch (error) {
        this.logger.warn(
          `[seats] attach 실패: eventId=${eventId} section=${sectionIndex} — Lua 호출 오류: ${error?.message ?? error}`,
        );
        continue;
      }
      if (!initialSeats) {
        this.logger.warn(
          `[seats] attach 실패: eventId=${eventId} section=${sectionIndex} — Redis에 좌석 데이터 없음`,
        );
        continue;
      }

      const key = `${eventId}:${sectionIndex}`;
      const seatSubscription = await this.createSeatSubscription(key, eventId, sectionIndex, initialSeats);
      this.seatsSubscriptionMap.set(key, seatSubscription);
      await this.pubsubClient.subscribe(`seats:changes:${eventId}:${sectionIndex}`);
      this.sseBroadcaster.startBroadcast(key, seatSubscription.subject.asObservable());
    }
  }

  async onModuleDestroy() {
    const eventIds = [
      ...new Set([...this.seatsSubscriptionMap.keys()].map((k) => parseInt(k.split(':')[0], 10))),
    ];
    await Promise.allSettled(eventIds.map((id) => this.clearSeatsSubscription(id)));
  }

  async clearSeatsSubscription(eventId: number) {
    const prefix = `${eventId}:`;
    const sectionKeys = Array.from(this.seatsSubscriptionMap.keys()).filter((k) => k.startsWith(prefix));

    for (const key of sectionKeys) {
      this.sseBroadcaster.stopBroadcast(key);
      const seatSubscription = this.seatsSubscriptionMap.get(key);
      if (seatSubscription) {
        clearInterval(seatSubscription.interval);
        seatSubscription.subject.complete();
        this.seatsSubscriptionMap.delete(key);
      }
      this.broadcastActivateMap.delete(key);
      const [eId, sIdx] = key.split(':');
      await this.pubsubClient.unsubscribe(`seats:changes:${eId}:${sIdx}`);
    }
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

    // VAL-01 (D-08): SSE 풀 소속이 권한의 본질 — isSidInPool 기반 검증
    const [sectionIndex] = target;
    const key = `${eventId}:${sectionIndex}`;
    if (!this.sseBroadcaster.isSidInPool(key, sid)) {
      throw new AppException(BookingErrorCode.SEAT_UNAUTHORIZED_SECTION);
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

    // VAL-02 (D-08): SSE 풀 소속이 권한의 본질 — isSidInPool 기반 검증
    const [sectionIndex] = target;
    const key = `${eventId}:${sectionIndex}`;
    if (!this.sseBroadcaster.isSidInPool(key, sid)) {
      throw new AppException(BookingErrorCode.SEAT_UNAUTHORIZED_SECTION);
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
      await this.redis.publish(`seats:changes:${eventId}:${sectionIndex}`, String(sectionIndex));
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
      await this.redis.publish(`seats:changes:${eventId}:${sectionIndex}`, String(sectionIndex));
      return {
        eventId,
        sectionIndex,
        seatIndex,
        acceptedStatus: SeatStatus.DELETE,
      };
    }
  }

  getSeatsObservable(eventId: number) {
    // Phase 2에서 섹션별 라우팅으로 교체 예정 — 현재는 첫 섹션 구독 반환
    const key = `${eventId}:0`;
    const subscription = this.seatsSubscriptionMap.get(key);
    if (!subscription) {
      throw new AppException(BookingErrorCode.SEAT_SUBSCRIPTION_NOT_FOUND);
    }
    return subscription.subject.asObservable();
  }

  async addSseClient(eventId: number, res: Response, sid: string): Promise<number> {
    const initKey = `${eventId}:init`;
    // startBroadcast 없음 — SSE 헤더만 전송, 좌석 데이터 없음 (SSE-02)
    const seq = this.sseBroadcaster.addClient(initKey, res, sid);

    // Phase 4: bookedSeats 복원 전송 — session 있고 bookedSeats 비어있지 않을 때만 (D-03)
    const session = await this.inBookingService.getSession(eventId, sid);
    if (session && session.bookedSeats.length > 0) {
      this.writeSseData(res, new OccupiedSeatsSseDto(session.bookedSeats));
    }

    return seq;
  }

  async removeSseClient(
    eventId: number,
    sid: string,
    res: Response,
    options: RemoveSseClientOptions,
  ): Promise<RemoveSseClientResult> {
    const session = await this.inBookingService.getSession(eventId, sid);
    if (!session) {
      return { removed: false, activeConnectionClosed: false, saved: false };
    }

    const closeSection = options.sectionIndex;
    const key = closeSection !== null ? `${eventId}:${closeSection}` : `${eventId}:init`;
    const removed = this.sseBroadcaster.removeClient(key, res, options.expectedSeq);
    const activeConnectionClosed = removed && (session.subscribedSection ?? null) === closeSection;

    // Stale close는 자기 풀 entry만 지우고 현재 활성 섹션 lifecycle은 건드리지 않는다.
    if (activeConnectionClosed && session.subscribedSection !== null) {
      session.subscribedSection = null;
      await this.inBookingService.setSession(eventId, session);
    }

    return { removed, activeConnectionClosed, saved: session.saved };
  }

  async addSseClientToSection(
    eventId: number,
    sectionIndex: number,
    res: Response,
    sid: string,
  ): Promise<number> {
    const key = `${eventId}:${sectionIndex}`;
    if (!this.seatsSubscriptionMap.has(key)) {
      await this.ensureSeatSubscription(key, eventId, sectionIndex);
    }
    const seq = this.sseBroadcaster.addClient(key, res, sid);

    // Phase 4: 재연결 복원 — session 있으면 항상 occupiedSeats 전송 (빈 배열 포함, D-03)
    // D-02: addSseClientToSection 내부에서만 subscribedSection 갱신 (단일 진실원)
    const session = await this.inBookingService.getSession(eventId, sid);
    if (session) {
      session.subscribedSection = sectionIndex;
      await this.inBookingService.setSession(eventId, session);

      this.writeSseData(res, new OccupiedSeatsSseDto(session.bookedSeats));
    }

    return seq;
  }

  private async ensureSeatSubscription(key: string, eventId: number, sectionIndex: number): Promise<void> {
    if (this.seatsSubscriptionMap.has(key)) return;

    if (!this.ensureSeatSubscriptionPromise.has(key)) {
      const promise = this._doEnsureSeatSubscription(key, eventId, sectionIndex).finally(() => {
        this.ensureSeatSubscriptionPromise.delete(key);
      });
      this.ensureSeatSubscriptionPromise.set(key, promise);
    }

    return this.ensureSeatSubscriptionPromise.get(key);
  }

  private async _doEnsureSeatSubscription(key: string, eventId: number, sectionIndex: number): Promise<void> {
    if (this.seatsSubscriptionMap.has(key)) return;

    let initialSeats: number[];
    try {
      initialSeats = await runGetSectionSeatsLua(this.redis, eventId, sectionIndex);
    } catch {
      this.logger.warn(`[seats] lazy init 실패: key=${key} — Redis에 좌석 데이터 없음`);
      return;
    }
    if (!initialSeats) {
      this.logger.warn(`[seats] lazy init 실패: key=${key} — Redis에 좌석 데이터 없음`);
      return;
    }

    const seatSubscription = await this.createSeatSubscription(key, eventId, sectionIndex, initialSeats);
    this.seatsSubscriptionMap.set(key, seatSubscription);
    await this.pubsubClient.subscribe(`seats:changes:${eventId}:${sectionIndex}`);
    this.sseBroadcaster.startBroadcast(key, seatSubscription.subject.asObservable());
  }

  private unActivateNextBroadcast = (key: string) => {
    this.broadcastActivateMap.set(key, false);
  };

  private isBroadcastActivated = (key: string) => {
    return this.broadcastActivateMap.get(key);
  };

  private async createSeatSubscription(
    key: string,
    eventId: number,
    sectionIndex: number,
    initialSeats: number[],
  ): Promise<SeatSubscription> {
    const subject = new BehaviorSubject(new SeatsSseDto(sectionIndex, initialSeats));
    let lastBroadcastTime = Date.now();

    const interval = setInterval(
      async () => {
        const now = Date.now();
        const timeSinceLastBroadcast = now - lastBroadcastTime;

        if (timeSinceLastBroadcast >= SSE_MAXIMUM_INTERVAL || this.isBroadcastActivated(key)) {
          try {
            const seats = await runGetSectionSeatsLua(this.redis, eventId, sectionIndex);
            if (seats) {
              subject.next(new SeatsSseDto(sectionIndex, seats));
              lastBroadcastTime = Date.now();
            }
            if (this.isBroadcastActivated(key)) {
              this.unActivateNextBroadcast(key);
            }
          } catch (error) {
            this.logger.error(`좌석 브로드캐스트 실패: key=${key}`, error);
          }
        }
      },
      Math.min(SEATS_BROADCAST_INTERVAL, SSE_MAXIMUM_INTERVAL),
    );

    return { subject, interval };
  }

  private writeSseData(res: Response, payload: SeatsSsePayloadDto): void {
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {}
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
