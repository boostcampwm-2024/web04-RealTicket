import { RedisModule } from '@liaoliaots/nestjs-redis';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import redisConfig from './config/redisConfig';
import ormConfig from './config/typeOrmConfig';
import { ProgramController } from './program/program.controller';
import { ProgramModule } from './program/program.module';
import { ProgramService } from './program/program.service';
import { UserController } from './user/user.controller';
import { UserService } from './user/user.service';

@Module({
  imports: [TypeOrmModule.forRoot(ormConfig), RedisModule.forRoot(redisConfig), ProgramModule],
  controllers: [AppController, UserController, ProgramController],
  providers: [AppService, UserService, ProgramService],
})
export class AppModule {}
