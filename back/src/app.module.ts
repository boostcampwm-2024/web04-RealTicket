import { RedisModule } from '@liaoliaots/nestjs-redis';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AuthController } from './auth/controller/auth.controller';
import redisConfig from './config/redisConfig';
import ormConfig from './config/typeOrmConfig';
import { UserController } from './user/controller/user.controller';
import { UserService } from './user/service/user.service';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(ormConfig),
    RedisModule.forRoot(redisConfig),
    UserModule,
    RedisModule,
    AuthModule,
  ],
  controllers: [AppController, UserController, AuthController],
  providers: [AppService, UserService],
})
export class AppModule {}
