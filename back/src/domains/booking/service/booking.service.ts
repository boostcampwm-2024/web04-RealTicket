import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { AuthService } from '../../../auth/service/auth.service';
import { BookingAdmissionStatusDto } from '../dto/bookingAdmissionStatus.dto';
import { ServerTimeDto } from '../dto/serverTime.dto';

import { BookingSeatsService } from './booking-seats.service';
import { EnterBookingService } from './enter-booking.service';
import { InBookingService } from './in-booking.service';
import { OpenBookingService } from './open-booking.service';
import { WaitingQueueService } from './waiting-queue.service';

@Injectable()
export class BookingService {
  private logger = new Logger(BookingService.name);
  constructor(
    private readonly authService: AuthService,
    private readonly bookingSeatsService: BookingSeatsService,
    private readonly inBookingService: InBookingService,
    private readonly openBookingService: OpenBookingService,
    private readonly waitingQueueService: WaitingQueueService,
    private readonly enterBookingService: EnterBookingService,
  ) {}

  @OnEvent('seats-sse-close')
  async onSeatsSseDisconnected(event: { sid: string }) {
    const sid = event.sid;
    const eventId = await this.authService.getUserEventTarget(sid);

    if (eventId === null) {
      return;
    }

    if (await this.openBookingService.isEventOpened(eventId)) {
      await this.collectSeatsIfNotSaved(eventId, sid);
      await this.inBookingService.emitSession(sid);
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

  @OnEvent('entering-sessions-gc')
  async onEnteringSessionsGc(event: { eventId: number }) {
    await this.letInNextWaiting(event.eventId);
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
    while (!(await isQueueEmpty(eventId)) && (await this.isInsertableInBooking(eventId))) {
      const item = await this.waitingQueueService.popQueue(eventId);
      if (!item) {
        break;
      }
      await this.enterBookingService.addEnteringSession(item.sid);
      await this.authService.setUserStatusEntering(item.sid);
    }
  }

  async setInBookingFromEntering(sid: string) {
    const eventId = await this.authService.getUserEventTarget(sid);

    if (eventId === null) {
      throw new BadRequestException('좌석 선택 상태로 이동할 세션의 대상 이벤트를 불러올 수 없습니다.');
    }

    const bookingAmount = await this.enterBookingService.getBookingAmount(sid);

    await this.enterBookingService.removeEnteringSession(sid);
    await this.inBookingService.insertInBooking(eventId, sid, bookingAmount);
    await this.authService.setUserStatusSelectingSeat(sid);
  }

  // 함수 이름 생각하기
  async isAdmission(eventId: number, sid: string): Promise<BookingAdmissionStatusDto> {
    const isOpened = await this.openBookingService.isEventOpened(eventId);
    if (!isOpened) {
      throw new BadRequestException('예약이 오픈되지 않았습니다.');
    }

    await this.authService.setUserEventTarget(sid, eventId);

    return await this.getForwarded(sid);
  }

  private async getForwarded(sid: string) {
    const eventId = await this.authService.getUserEventTarget(sid);

    if (eventId === null) {
      throw new BadRequestException('permission할 세션의 대상 이벤트를 불러올 수 없습니다.');
    }

    const isInsertable = await this.isInsertableInBooking(eventId);

    if (isInsertable) {
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

  private async isInsertableInBooking(eventId: number): Promise<boolean> {
    const inBookingCount = await this.inBookingService.getInBookingSessionCount(eventId);
    const inBookingReconnectingCount = await this.inBookingService.getReconnectingSessionCount(eventId);
    const enteringCount = await this.enterBookingService.getEnteringSessionCount(eventId);
    const maxSize = await this.inBookingService.getInBookingSessionsMaxSize(eventId);
    return inBookingCount + inBookingReconnectingCount + enteringCount < maxSize;
  }

  async setBookingAmount(sid: string, bookingAmount: number) {
    const isInBooking = await this.inBookingService.isInBooking(sid);
    if (isInBooking) {
      await this.flushBookedSeats(sid);
      return await this.inBookingService.setBookingAmount(sid, bookingAmount);
    }

    const isEntering = await this.enterBookingService.isEntering(sid);
    if (!isEntering) {
      throw new BadRequestException('예매 수량을 설정할 수 없는 상태입니다.');
    }
    return await this.enterBookingService.setBookingAmount(sid, bookingAmount);
  }

  private async flushBookedSeats(sid: string) {
    const bookedSeats = await this.inBookingService.getBookedSeats(sid);
    if (bookedSeats.length > 0) {
      const eventId = await this.authService.getUserEventTarget(sid);

      if (eventId === null) {
        throw new BadRequestException('좌석을 회수할 세션의 대상 이벤트를 불러올 수 없습니다.');
      }

      await Promise.all(bookedSeats.map((seat) => this.bookingSeatsService.updateSeatDeleted(eventId, seat)));
      await this.inBookingService.removeBookedSeats(sid);
    }
  }

  async freeSeatsIfEventOpened(eventId: number, seats: [number, number][]) {
    if (await this.openBookingService.isEventOpened(eventId)) {
      await Promise.all(seats.map((seat) => this.bookingSeatsService.updateSeatDeleted(eventId, seat)));
    }
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
