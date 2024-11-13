import { Module } from '@nestjs/common';

import { EventController } from './event.controller';
import { EventService } from './event.service';
import { EventRepository } from './repository/event.repository';

@Module({
  controllers: [EventController],
  providers: [EventService, EventRepository],
  exports: [EventService],
})
export class EventModule {}
