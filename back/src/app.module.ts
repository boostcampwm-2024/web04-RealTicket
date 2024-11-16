import { RedisModule } from '@liaoliaots/nestjs-redis';
import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import redisConfig from './config/redisConfig';
import ormConfig from './config/typeOrmConfig';
import { BookingModule } from './domains/booking/booking.module';
import { EventModule } from './domains/event/event.module';
import { PlaceModule } from './domains/place/place.module';
import { ProgramModule } from './domains/program/program.module';
import { ReservationModule } from './domains/reservation/reservation.module';
import { UserModule } from './domains/user/user.module';
import { MockModule } from './mock/mock.module';
import { UserDecoratorMiddleware } from './util/user-injection/user.decorator.middleware';
import { UserDecoratorModule } from './util/user-injection/user.decorator.module';

@Module({
  imports: [
    ...(process.env.MOCK_MODE !== 'true'
      ? [
          TypeOrmModule.forRoot(ormConfig),
          RedisModule.forRoot(redisConfig),
          ProgramModule,
          ReservationModule,
          PlaceModule,
          UserModule,
          BookingModule,
          EventModule,
          UserDecoratorModule,
        ]
      : []),
    MockModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(UserDecoratorMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
