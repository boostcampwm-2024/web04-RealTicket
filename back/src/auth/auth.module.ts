import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from '../user/entity/user.entity';

import { AuthService } from './service/auth.service';

@Module({
  imports: [PassportModule.register({ session: true }), TypeOrmModule.forFeature([UserEntity])],
  controllers: [],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
