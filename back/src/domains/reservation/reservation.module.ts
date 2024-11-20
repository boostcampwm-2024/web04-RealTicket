import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventModule } from '../event/event.module';
import { UserModule } from '../user/user.module';

import { ReservationController } from './controller/reservation.controller';
import { Reservation } from './entity/reservation.entity';
import { ReservedSeat } from './entity/reservedSeat.entity';
import { ReservationRepository } from './repository/reservation.repository';
import { ReservedSeatRepository } from './repository/reservedSeat.repository';
import { ReservationService } from './service/reservation.service';

@Module({
  imports: [TypeOrmModule.forFeature([Reservation, ReservedSeat]), EventModule, UserModule],
  controllers: [ReservationController],
  providers: [ReservationService, ReservationRepository, ReservedSeatRepository],
})
export class ReservationModule {}
