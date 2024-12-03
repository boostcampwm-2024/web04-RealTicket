import { RedisService } from '@liaoliaots/nestjs-redis';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { UserService } from '../../user/service/user.service';
import { SEATS_BROADCAST_INTERVAL } from '../const/seatsBroadcastInterval.const';
import { SEATS_SSE_RETRY_TIME } from '../const/seatsSseRetryTime.const';
import { SeatStatus } from '../const/seatStatus.enum';
import { SSE_MAXIMUM_INTERVAL } from '../const/sseMaximumInterval';
import { SeatsSseDto } from '../dto/seatsSse.dto';
import { runGetSeatsLua } from '../luaScripts/getSeatsLua';
import { runInitSectionSeatLua } from '../luaScripts/initSectionSeatLua';
import { runSetSectionsLenLua } from '../luaScripts/setSectionsLenLua';
import { runUpdateSeatLua } from '../luaScripts/updateSeatLua';

import { InBookingService } from './in-booking.service';

type SeatStatusObject = {
  seatStatus: boolean[][];
};

@Injectable()
export class BookingSeatsService {
  private readonly redis: Redis | null;
  private seatsSubscriptionMap = new Map<number, BehaviorSubject<SeatStatusObject>>();
  private broadcastActivateMap = new Map<number, boolean>();

  constructor(
    private redisService: RedisService,
    private inBookingService: InBookingService,
    private eventEmitter: EventEmitter2,
    private readonly userService: UserService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async openReservation(eventId: number, seats: boolean[][]) {
    seats.forEach((section, sectionIndex) => {
      const seatBitMap = section.map((seat) => (seat ? '1' : '0')).join('');
      const key = `event:${eventId}:section:${sectionIndex}:seats`;
      runInitSectionSeatLua(this.redis, key, seatBitMap);
    });
    await runSetSectionsLenLua(this.redis, eventId, seats.length);

    if (this.seatsSubscriptionMap.has(eventId)) {
      throw new InternalServerErrorException('이미 해당 이벤트의 좌석 구독이 존재합니다.');
    }
    const subscription = await this.createSeatSubscription(eventId, seats);
    this.seatsSubscriptionMap.set(eventId, subscription);
  }

  async clearSeatsSubscription(eventId: number) {
    const subscription = this.seatsSubscriptionMap.get(eventId);
    if (subscription) {
      subscription.complete();
      this.seatsSubscriptionMap.delete(eventId);
    }
    const keys = await this.redis.keys(`event:${eventId}:*`);
    if (keys.length > 0) {
      await this.redis.unlink(...keys);
    }
  }

  async bookSeat(sid: string, target: [number, number]) {
    const eventId = await this.userService.getUserEventTarget(sid);
    const bookedSeat = await this.inBookingService.getBookedSeats(sid);
    const bookingAmount = await this.inBookingService.getBookingAmount(sid);
    const bookedAmount = bookedSeat.length;

    if (bookingAmount <= bookedAmount) {
      throw new BadRequestException('예약 가능한 좌석 수를 초과했습니다.');
    }

    const result = await this.updateSeatReserved(eventId, target);
    if (result) {
      await this.inBookingService.addBookedSeat(sid, target);
    }
    return result;
  }

  async unBookSeat(sid: string, target: [number, number]) {
    const eventId = await this.userService.getUserEventTarget(sid);
    const bookedSeat = await this.inBookingService.getBookedSeats(sid);
    const bookedAmount = bookedSeat.length;

    if (bookedAmount === 0) {
      throw new BadRequestException('취소할 수 있는 좌석이 없습니다.');
    }
    if (!bookedSeat.some((seat) => seat[0] === target[0] && seat[1] === target[1])) {
      throw new BadRequestException('예약하지 않은 좌석입니다.');
    }

    const result = await this.updateSeatDeleted(eventId, target);
    if (result) {
      await this.inBookingService.removeBookedSeat(sid, target);
    }
    return result;
  }

  async updateSeatReserved(eventId: number, target: [number, number]) {
    const [sectionIndex, seatIndex] = target;
    const key = `event:${eventId}:section:${sectionIndex}:seats`;

    const result = await runUpdateSeatLua(this.redis, key, seatIndex, 0);

    if (result === 'nil') {
      throw new BadRequestException('좌석이 존재하지 않습니다.');
    } else if (result === 0) {
      throw new ConflictException('이미 예약된 좌석입니다.');
    } else {
      this.eventEmitter.emit('seats-status-changed', { eventId });
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
      throw new BadRequestException('좌석이 존재하지 않습니다.');
    } else if (result === 0) {
      throw new ConflictException('이미 취소된 좌석입니다.');
    } else {
      this.eventEmitter.emit('seats-status-changed', { eventId });
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
      throw new InternalServerErrorException('좌석 정보를 가져오는데 실패했습니다.');
    }
    return seatStatusBits.map((sectionBits) => sectionBits.map((bit) => bit === 1));
  }

  subscribeSeats(eventId: number) {
    return this.seatsSubscriptionMap
      .get(eventId)
      .asObservable()
      .pipe(
        map((data) => {
          return {
            data,
            retry: SEATS_SSE_RETRY_TIME,
          };
        }),
      );
  }

  @OnEvent('seats-status-changed')
  private async activateNextBroadcast(event: { eventId: number }) {
    this.broadcastActivateMap.set(event.eventId, true);
  }

  private unActivateNextBroadcast = (eventId: number) => {
    this.broadcastActivateMap.set(eventId, false);
  };

  private isBroadcastActivated = (eventId: number) => {
    return this.broadcastActivateMap.get(eventId);
  };

  private async createSeatSubscription(eventId: number, initialSeats: boolean[][]) {
    const subscription = new BehaviorSubject<SeatStatusObject>({ seatStatus: initialSeats });
    let lastBroadcastTime = Date.now();

    setInterval(
      async () => {
        const now = Date.now();
        const timeSinceLastBroadcast = now - lastBroadcastTime;

        if (timeSinceLastBroadcast >= SSE_MAXIMUM_INTERVAL || this.isBroadcastActivated(eventId)) {
          const seats = await this.getSeats(eventId);
          subscription.next(new SeatsSseDto(seats));
          lastBroadcastTime = Date.now();

          if (this.isBroadcastActivated(eventId)) {
            this.unActivateNextBroadcast(eventId);
          }
        }
      },
      Math.min(SEATS_BROADCAST_INTERVAL, SSE_MAXIMUM_INTERVAL),
    );

    return subscription;
  }
}
