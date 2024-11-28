import { RedisService } from '@liaoliaots/nestjs-redis';
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import Redis from 'ioredis';

import { AuthService } from '../../../auth/service/auth.service';
import { EventService } from '../../event/service/event.service';
import { BookingAdmissionStatusDto } from '../dto/bookingAdmissionStatus.dto';
import { ServerTimeDto } from '../dto/serverTime.dto';

import { EnterBookingService } from './enter-booking.service';
import { InBookingService } from './in-booking.service';
import { OpenBookingService } from './open-booking.service';
import { WaitingQueueService } from './waiting-queue.service';

const OFFSET = 1000 * 60 * 60 * 9;

@Injectable()
export class BookingService {
  private logger = new Logger(BookingService.name);
  private readonly redis: Redis | null;
  constructor(
    private readonly redisService: RedisService,
    private readonly eventService: EventService,
    private readonly authService: AuthService,
    private readonly inBookingService: InBookingService,
    private readonly openBookingService: OpenBookingService,
    private readonly waitingQueueService: WaitingQueueService,
    private readonly enterBookingService: EnterBookingService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  @OnEvent('seats-sse-close')
  async onSeatsSseDisconnected(event: { sid: string }) {
    const eventId = await this.authService.getUserEventTarget(event.sid);
    await this.inBookingService.emitSession(event.sid);
    await this.letInNextWaiting(eventId);
  }

  @OnEvent('in-booking-max-size-changed')
  async onSpecificInBookingMaxSizeChanged(event: { eventId: number }) {
    await this.letInNextWaiting(event.eventId);
  }

  @OnEvent('all-in-booking-max-size-changed')
  async onAllInBookingMaxSizeChanged() {
    const eventIds = await this.openBookingService.getOpenedEventIds();
    await Promise.all(
      eventIds.map(async (eventId) => {
        await this.letInNextWaiting(eventId);
      }),
    );
  }

  private async letInNextWaiting(eventId: number) {
    const isQueueEmpty = async (eventId: number) =>
      (await this.waitingQueueService.getQueueSize(eventId)) < 1;
    while (!(await isQueueEmpty(eventId)) && (await this.inBookingService.isInsertable(eventId))) {
      const item = await this.waitingQueueService.popQueue(eventId);
      if (!item) {
        break;
      }
      await this.enterBookingService.addEnteringSession(item.sid);
      await this.authService.setUserStatusEntering(item.sid);
    }
  }

  async setSessionSelectingFromEntering(sid: string) {
    await this.enterBookingService.removeEnteringSession(sid);
    await this.authService.setUserStatusSelectingSeat(sid);
  }

  // 함수 이름 생각하기
  async isAdmission(eventId: number, sid: string): Promise<BookingAdmissionStatusDto> {
    // eventId를 받아서 해당 이벤트가 존재하는지 확인한다.
    const event = await this.eventService.findEvent({ eventId });
    const now = new Date(Date.now() + OFFSET);
    const isOpened = await this.openBookingService.isEventOpened(eventId);

    if (!isOpened) {
      throw new BadRequestException('아직 예약이 오픈되지 않았습니다.');
    } else if (now >= event.reservationCloseDate) {
      //event 시간 확인 이벤트 종료시간 이후인지
      // 예약 시간이 아닙니다.
      throw new BadRequestException('이미 예약 마감된 이벤트입니다.');
    }

    await this.authService.setUserEventTarget(sid, eventId);

    return await this.getForwarded(sid);
  }

  private async getForwarded(sid: string) {
    const isEntered = await this.inBookingService.insertIfPossible(sid);

    if (isEntered) {
      await this.enterBookingService.addEnteringSession(sid);
      await this.authService.setUserStatusEntering(sid);
      return {
        waitingStatus: false,
        enteringStatus: true,
      };
    }

    await this.authService.setUserStatusWaiting(sid);
    const userOrder = await this.waitingQueueService.pushQueue(sid);
    return {
      waitingStatus: true,
      enteringStatus: false,
      userOrder,
    };
  }

  async getTimeMs(): Promise<ServerTimeDto> {
    try {
      return {
        now: Date.now(),
      };
    } catch (err) {
      this.logger.error(err);
      throw new InternalServerErrorException('서버 시간을 가져오는데 실패했습니다.');
    }
  }
}
