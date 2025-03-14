import { Injectable } from '@nestjs/common';

import { BookingSeatsService } from '../../domains/booking/service/booking-seats.service';

@Injectable()
export class SeatsBenchmarkService {
  constructor(private readonly bookingSeatsService: BookingSeatsService) {}

  async getSeatsStatusByEventId(eventId: number) {
    return await this.bookingSeatsService.getSeats(eventId);
  }
}
