import { Module } from '@nestjs/common';

import { BookingModule } from './booking/booking.module';
import { MockController } from './mock.controller';
import { MockService } from './mock.service';
import { PlaceModule } from './place/place.module';
import { ReservationModule } from './reservation/reservation.module';

@Module({
  controllers: [MockController],
  providers: [MockService],
  imports: [ReservationModule, BookingModule, PlaceModule],
})
export class MockModule {}
