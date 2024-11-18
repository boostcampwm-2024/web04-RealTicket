import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReservationController } from './controller/reservation.controller';
import { Reservation } from './entity/reservation.entity';
import { ReservedSeat } from './entity/reservedSeat.entity';
import { ReservationRepository } from './repository/reservation.repository';
import { ReservationService } from './service/reservation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Reservation, ReservedSeat])],
  controllers: [ReservationController],
  providers: [ReservationService, ReservationRepository],
})
export class ReservationModule {}
