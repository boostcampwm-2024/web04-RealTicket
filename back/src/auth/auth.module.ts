import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../user/entity/user.entity';

import { AuthService } from './service/auth.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
