import { Module } from '@nestjs/common';

import { BookingModule } from './booking/booking.module';
import { EventModule } from './event/event.module';
import { MockController } from './mock.controller';
import { MockService } from './mock.service';
import { PlaceModule } from './place/place.module';
import { ProgramModule } from './program/program.module';
import { ReservationModule } from './reservation/reservation.module';

@Module({
  controllers: [MockController],
  providers: [MockService],
  imports: [ReservationModule, BookingModule, PlaceModule, EventModule, ProgramModule],
})
export class MockModule {}
