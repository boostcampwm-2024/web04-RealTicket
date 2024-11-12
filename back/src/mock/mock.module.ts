import { Module } from '@nestjs/common';

import { MockController } from './mock.controller';
import { MockService } from './mock.service';
import { ReservationModule } from './reservation/reservation.module';

@Module({
  controllers: [MockController],
  providers: [MockService],
  imports: [ReservationModule],
})
export class MockModule {}
