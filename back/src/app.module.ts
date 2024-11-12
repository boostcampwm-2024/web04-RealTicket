import { RedisModule } from '@liaoliaots/nestjs-redis';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import redisConfig from './config/redisConfig';
import ormConfig from './config/typeOrmConfig';
import { PlaceModule } from './place/place.module';
import { PlaceService } from './place/place.service';
import { ProgramController } from './program/program.controller';
import { ProgramModule } from './program/program.module';
import { ProgramService } from './program/program.service';
import { ReservationController } from './reservation/reservation.controller';
import { ReservationModule } from './reservation/reservation.module';
import { ReservationService } from './reservation/reservation.service';
import { UserController } from './user/user.controller';
import { UserService } from './user/user.service';

@Module({
  imports: [
    TypeOrmModule.forRoot(ormConfig),
    RedisModule.forRoot(redisConfig),
    ProgramModule,
    ReservationModule,
    PlaceModule,
  ],
  controllers: [AppController, UserController, ProgramController, ReservationController],
  providers: [AppService, UserService, ProgramService, ReservationService, PlaceService],
})
export class AppModule {}
