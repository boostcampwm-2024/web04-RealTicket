import { Controller } from '@nestjs/common';

import { EventService } from './event.service';

@Controller('mock/event')
export class EventController {
  constructor(private readonly eventService: EventService) {}
}
