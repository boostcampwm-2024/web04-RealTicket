import { Controller, Get, Param } from '@nestjs/common';

import { EventService } from './event.service';

@Controller('mock/events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get(':eventId')
  getEventById(@Param('eventId') eventId: number) {
    return this.eventService.getEventById(eventId);
  }
}
