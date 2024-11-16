import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from 'src/auth/auth.module';
import { AuthService } from 'src/auth/service/auth.service';
import { User } from 'src/domains/user/entity/user.entity';
import { UserService } from 'src/domains/user/service/user.service';
import { UserModule } from 'src/domains/user/user.module';

import { UserDecoratorService } from './user.decorator.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), UserModule, AuthModule],
  providers: [UserDecoratorService, UserService, AuthService],
  exports: [UserDecoratorService],
})
export class UserDecoratorModule {}
