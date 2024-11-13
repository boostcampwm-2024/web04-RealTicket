import { RedisModule } from '@liaoliaots/nestjs-redis';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import redisConfig from './config/redisConfig';
import ormConfig from './config/typeOrmConfig';
import { UserModule } from './user/user.module';

import { PlaceModule } from './place/place.module';
import { ProgramModule } from './program/program.module';
import { ReservationModule } from './reservation/reservation.module';
import { UtilModule } from './util/util.module';
@Module({
  imports: [
    TypeOrmModule.forRoot(ormConfig),
    RedisModule.forRoot(redisConfig),
    ProgramModule,
    ReservationModule,
    PlaceModule,
    UtilModule,
    UserModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
