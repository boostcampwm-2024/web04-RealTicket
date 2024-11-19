import { Controller, Get, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';

import { EventService } from './event.service';

@Controller('mock/events')
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get(':eventId')
  getEventById(@Param('eventId') eventId: number) {
    return this.eventService.getEventById(eventId);
  }

  @Sse('seats/:eventId')
  getReservationStatusByEventId(@Param('eventId') eventId: number): Observable<MessageEvent> {
    return this.eventService.getSeatStatusByEventId(eventId);
  }
}
