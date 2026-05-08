import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GlobalExceptionFilter } from './common/exception/global-exception.filter';
import { BenchmarkModule } from './benchmark/benchmark.module';
import { getDatabaseModule, getRedisModule } from './config/moduleFactory';
import { BookingModule } from './domains/booking/booking.module';
import { EventModule } from './domains/event/event.module';
import { PlaceModule } from './domains/place/place.module';
import { ProgramModule } from './domains/program/program.module';
import { ReservationModule } from './domains/reservation/reservation.module';
import { UserModule } from './domains/user/user.module';
import { MetricsModule } from './metrics/metrics.module';
import { LoggingModule } from './util/logger/logging.module';
import { UserDecoratorMiddleware } from './util/user-injection/user.decorator.middleware';
import { UserDecoratorModule } from './util/user-injection/user.decorator.module';

@Module({
  imports: [
    getDatabaseModule(),
    getRedisModule(),
    ScheduleModule.forRoot(),
    LoggingModule,
    MetricsModule,
    ProgramModule,
    ReservationModule,
    PlaceModule,
    UserModule,
    BookingModule,
    EventModule,
    UserDecoratorModule,
    ...(process.env.BENCHMARK_MODE === 'true' ? [BenchmarkModule] : []),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UserDecoratorMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
