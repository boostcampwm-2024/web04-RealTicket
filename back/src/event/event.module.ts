import { Module } from '@nestjs/common';
import { EventService } from './service/event.service';
import { EventController } from './controller/event.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventRepository } from './repository/event.reposiotry';
import { Event } from './entity/event.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Event]),
  ],
  controllers: [EventController],
  providers: [EventService, EventRepository],
})
export class EventModule {}
