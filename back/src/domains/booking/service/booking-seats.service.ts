import { RedisService } from '@liaoliaots/nestjs-redis';
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { interval, Observable, switchMap } from 'rxjs';

import { AuthService } from '../../../auth/service/auth.service';
import { SeatStatus } from '../const/seatStatus.enum';
import { runGetSeatsLua } from '../luaScripts/getSeatsLua';
import { runInitSectionSeatLua } from '../luaScripts/initSectionSeatLua';
import { runSetSectionsLenLua } from '../luaScripts/setSectionsLenLua';
import { runUpdateSeatLua } from '../luaScripts/updateSeatLua';

import { InBookingService } from './in-booking.service';

@Injectable()
export class BookingSeatsService {
  private readonly redis: Redis | null;

  constructor(
    private redisService: RedisService,
    private inBookingService: InBookingService,
    private authService: AuthService,
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
  }

  async bookSeat(sid: string, target: [number, number]) {
    const eventId = await this.authService.getUserEventTarget(sid);
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
    const eventId = await this.authService.getUserEventTarget(sid);
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
    return seatStatusBits.map((sectionBits) => sectionBits.map((bit) => bit === 1));
  }

  subscribeSeats(eventId: number): Observable<any> {
    return interval(1000).pipe(
      switchMap(async () => {
        const seatsData = await this.getSeats(eventId);
        return {
          data: { seaStatus: seatsData },
        };
      }),
    );
  }
}
