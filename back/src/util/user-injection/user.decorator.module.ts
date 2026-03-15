import { Module } from '@nestjs/common';

import { AuthModule } from 'src/auth/auth.module';

import { UserDecoratorService } from './user.decorator.service';

@Module({
  imports: [AuthModule],
  providers: [UserDecoratorService],
  exports: [UserDecoratorService],
})
export class UserDecoratorModule {}
