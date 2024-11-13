import { Module } from '@nestjs/common';

import { BookingModule } from './booking/booking.module';
import { EventModule } from './event/event.module';
import { PlaceModule } from './place/place.module';
import { ProgramModule } from './program/program.module';
import { ReservationModule } from './reservation/reservation.module';

@Module({
  imports: [ReservationModule, BookingModule, PlaceModule, EventModule, ProgramModule],
})
export class MockModule {}
