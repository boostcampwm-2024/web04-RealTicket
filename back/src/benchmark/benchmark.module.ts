import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { AuthModule } from '../auth/auth.module';
import { BookingModule } from '../domains/booking/booking.module';
import { EventModule } from '../domains/event/event.module';
import { LoggingModule } from '../util/logger/logging.module';

import { BenchmarkController } from './controller/benchmark.controller';
import { SeatsGateway } from './gateway/seats.gateway';
import { SeatsBenchmarkService } from './service/seats-benchmark.service';

@Module({
  imports: [EventEmitterModule.forRoot(), BookingModule, EventModule, AuthModule, LoggingModule],
  controllers: [BenchmarkController],
  providers: [SeatsGateway, SeatsBenchmarkService],
  exports: [],
})
export class BenchmarkModule {}
