import { Module } from '@nestjs/common';

import { LoggingModule } from '../util/logger/logging.module';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [LoggingModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
