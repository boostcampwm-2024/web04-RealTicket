import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EventModule } from '../event/event.module';

import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

@Module({
  imports: [EventModule, AuthModule],
  providers: [BookingService],
  controllers: [BookingController],
  exports: [BookingService],
})
export class BookingModule {}
