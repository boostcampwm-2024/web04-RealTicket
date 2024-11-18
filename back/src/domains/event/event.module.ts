import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PlaceModule } from '../place/place.module';
import { ProgramModule } from '../program/program.module';

import { EventController } from './controller/event.controller';
import { Event } from './entity/event.entity';
import { EventRepository } from './repository/event.reposiotry';
import { EventService } from './service/event.service';

@Module({
  imports: [TypeOrmModule.forFeature([Event]), ProgramModule, PlaceModule],
  controllers: [EventController],
  providers: [EventService, EventRepository],
  exports: [EventService, EventRepository],
})
export class EventModule {}
