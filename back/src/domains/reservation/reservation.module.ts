import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../auth/auth.module';
import { BookingModule } from '../booking/booking.module';
import { EventModule } from '../event/event.module';
import { PlaceModule } from '../place/place.module';
import { UserModule } from '../user/user.module';

import { ReservationController } from './controller/reservation.controller';
import { Reservation } from './entity/reservation.entity';
import { ReservedSeat } from './entity/reservedSeat.entity';
import { ReservationRepository } from './repository/reservation.repository';
import { ReservedSeatRepository } from './repository/reservedSeat.repository';
import { ReservationService } from './service/reservation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reservation, ReservedSeat]),
    EventModule,
    UserModule,
    PlaceModule,
    AuthModule,
    BookingModule,
    UserModule,
  ],
  controllers: [ReservationController],
  providers: [ReservationService, ReservationRepository, ReservedSeatRepository],
})
export class ReservationModule {}
