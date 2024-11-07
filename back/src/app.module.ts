import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserController } from './user/user.controller';
import { UserService } from './user/user.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import ormConfig from './config/typeOrmConfig';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import redisConfig from './config/redisConfig';

@Module({
  imports: [
    TypeOrmModule.forRoot(ormConfig),
    RedisModule.forRoot(redisConfig)
  ],
  controllers: [AppController, UserController],
  providers: [AppService, UserService],

})
export class AppModule {}
