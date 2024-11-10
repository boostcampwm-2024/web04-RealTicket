import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '../entity/user.entity';
import { UserModule } from '../user/user.module';
import { UserRepository } from '../user/user.repository';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalSerializer } from './local.serializer';
import { LocalStrategy } from './strategy/local.strategy';

@Module({
  imports: [PassportModule.register({ session: true }), TypeOrmModule.forFeature([UserEntity]), UserModule],
  controllers: [AuthController],
  providers: [LocalStrategy, AuthService, LocalSerializer, UserRepository],
  exports: [AuthService],
})
export class AuthModule {}
