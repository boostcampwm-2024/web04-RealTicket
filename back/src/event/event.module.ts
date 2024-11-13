import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventController } from './controller/event.controller';
import { Event } from './entity/event.entity';
import { EventRepository } from './repository/event.reposiotry';
import { EventService } from './service/event.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event])],
  controllers: [EventController],
  providers: [EventService, EventRepository],
  exports: [EventService],
})
export class EventModule {}
