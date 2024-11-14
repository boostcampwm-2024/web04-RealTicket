import { Module } from '@nestjs/common';

import { UtilController } from './controller/util.controller';
import { UtilService } from './service/util.service';

@Module({
  controllers: [UtilController],
  providers: [UtilService],
})
export class UtilModule {}
