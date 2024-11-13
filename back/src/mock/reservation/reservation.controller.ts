import { Controller, Get, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';

import { ReservationService } from './reservation.service';

@Controller('mock/reservation')
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  @Get()
  getReservations() {
    return this.reservationService.getReservations();
  }

  @Sse(':eventId')
  getReservationStatusByEventId(@Param('eventId') eventId: number): Observable<MessageEvent> {
    return this.reservationService.getReservationStatusByEventId(eventId);
  }
}
