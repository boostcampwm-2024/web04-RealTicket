import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AuthModule } from '../auth/auth.module';
import { BookingModule } from '../domains/booking/booking.module';
import { EventModule } from '../domains/event/event.module';

import { SeatsGateway } from './gateway/seats.gateway';

@Module({
  imports: [EventEmitterModule.forRoot(), BookingModule, EventModule, AuthModule],
  controllers: [],
  providers: [SeatsGateway],
  exports: [],
})
export class BenchmarkModule {}
