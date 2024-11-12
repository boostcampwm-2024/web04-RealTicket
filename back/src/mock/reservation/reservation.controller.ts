import { Controller } from '@nestjs/common';

import { ReservationService } from './reservation.service';

@Controller('mock/reservation')
export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}
}
