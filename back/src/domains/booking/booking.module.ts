import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { EventModule } from '../event/event.module';

import { BookingController } from './controller/booking.controller';
import { BookingService } from './service/booking.service';
import { InBookingService } from './service/in-booking.service';

@Module({
  imports: [EventModule, AuthModule],
  controllers: [BookingController],
  providers: [BookingService, InBookingService],
})
export class BookingModule {}
