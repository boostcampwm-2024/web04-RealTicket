import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { interval, Observable, switchMap } from 'rxjs';

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
    try {
      const sectionIndex = target[0];
      const seatIndex = target[1];
      const seatsData = await this.redis.get(`event:${eventId}:seats`);
      const seats = JSON.parse(seatsData);
      seats[sectionIndex][seatIndex] = false;
      await this.redis.set(`event:${eventId}:seats`, JSON.stringify(seats));
      return true;
    } catch (error) {
      return error.message();
    }
  }

  async unBookSeat(eventId: number, target: [number, number]) {
    const sectionIndex = target[0];
    const seatIndex = target[1];
    const seatsData = await this.redis.get(`event:${eventId}:seats`);
    const seats = JSON.parse(seatsData);
    seats[sectionIndex][seatIndex] = true;
    await this.redis.set(`event:${eventId}:seats`, JSON.stringify(seats));
    return true;
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
