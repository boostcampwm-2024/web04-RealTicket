// booking.module.ts
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { EventModule } from '../event/event.module'; // Import EventModule

import { BookingService } from './booking.service';

@Module({
  imports: [EventModule, AuthModule],
  providers: [BookingService],
})
export class BookingModule {}
