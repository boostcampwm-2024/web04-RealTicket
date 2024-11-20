import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { EventModule } from '../event/event.module';
import { PlaceModule } from '../place/place.module';

import { BookingController } from './controller/booking.controller';
import { BookingSeatsService } from './service/booking-seats.service';
import { BookingService } from './service/booking.service';
import { InBookingService } from './service/in-booking.service';
import { OpenBookingService } from './service/open-booking.service';

@Module({
  imports: [EventModule, AuthModule, PlaceModule],
  controllers: [BookingController],
  providers: [BookingService, InBookingService, OpenBookingService, BookingSeatsService],
})
export class BookingModule {}
