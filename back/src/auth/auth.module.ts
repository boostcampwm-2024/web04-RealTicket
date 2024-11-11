import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '../user/entity/user.entity';
import { UserRepository } from '../user/repository/user.repository';
import { UserModule } from '../user/user.module';

import { LocalSerializer } from './local.serializer';
import { AuthService } from './service/auth.service';
import { AuthController } from './strategy/auth.controller';
import { LocalStrategy } from './strategy/local.strategy';

@Module({
  imports: [PassportModule.register({ session: true }), TypeOrmModule.forFeature([UserEntity]), UserModule],
  controllers: [AuthController],
  providers: [LocalStrategy, AuthService, LocalSerializer, UserRepository],
  exports: [AuthService],
})
export class AuthModule {}
