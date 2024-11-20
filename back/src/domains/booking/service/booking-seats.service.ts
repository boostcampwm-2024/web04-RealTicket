import { RedisService } from '@liaoliaots/nestjs-redis';
import { ConflictException, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { interval, Observable, switchMap } from 'rxjs';

import { SeatStatus } from '../const/seatStatus.enum';

@Injectable()
export class BookingSeatsService {
  private readonly redis: Redis | null;
  constructor(private redisService: RedisService) {
    this.redis = this.redisService.getOrThrow();
  }

  async openReservation(eventId: number, seats: boolean[][]) {
    await this.redis.set(`event:${eventId}:seats`, JSON.stringify(seats));
  }

  //TODO: 트랜잭션 관리 필요
  async bookSeat(eventId: number, target: [number, number]) {
    const [sectionIndex, seatIndex] = target;
    const seatsData = await this.redis.get(`event:${eventId}:seats`);
    const seats = JSON.parse(seatsData);

    if (seats[sectionIndex][seatIndex] === false) {
      throw new ConflictException('이미 예약된 좌석입니다.');
    }
    seats[sectionIndex][seatIndex] = false;

    await this.redis.set(`event:${eventId}:seats`, JSON.stringify(seats));
    return {
      eventId,
      sectionIndex,
      seatIndex,
      acceptedStatus: SeatStatus.RESERVE,
    };
  }

  async unBookSeat(eventId: number, target: [number, number]) {
    const [sectionIndex, seatIndex] = target;
    const seatsData = await this.redis.get(`event:${eventId}:seats`);
    const seats = JSON.parse(seatsData);

    if (seats[sectionIndex][seatIndex] === true) {
      throw new ConflictException('이미 취소된 좌석입니다.');
    }
    seats[sectionIndex][seatIndex] = true;

    await this.redis.set(`event:${eventId}:seats`, JSON.stringify(seats));
    return {
      eventId,
      sectionIndex,
      seatIndex,
      acceptedStatus: SeatStatus.DELETE,
    };
  }

  async getSeats(eventId: number): Promise<boolean[][]> {
    const seatsData = await this.redis.get(`event:${eventId}:seats`);
    return JSON.parse(seatsData);
  }

  subscribeSeats(eventId: number): Observable<any> {
    return interval(1000).pipe(
      switchMap(async () => {
        const seatsData = await this.getSeats(eventId);
        return {
          data: { 'seat-status': seatsData },
        };
      }),
    );
  }
}
