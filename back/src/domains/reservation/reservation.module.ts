import { Module } from '@nestjs/common';

import { ReservationController } from './controller/reservation.controller';
import { ReservationService } from './service/reservation.service';

@Module({
  controllers: [ReservationController],
  providers: [ReservationService],
})
export class ReservationModule {}
