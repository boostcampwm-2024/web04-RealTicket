import { Controller, Get } from '@nestjs/common';

import { ReservationService } from './reservation.service';

@Controller('mock/reservation')
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  @Get()
  getReservations() {
    return this.reservationService.getReservations();
  }
}
