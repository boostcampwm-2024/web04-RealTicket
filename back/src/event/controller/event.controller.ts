import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';

import { EventIdDto } from '../dto/eventIdDto';
import { EventSpecificDto } from '../dto/eventSpecificDto';
import { EventService } from '../service/event.service';

@Controller('event')
@UseInterceptors(ClassSerializerInterceptor)
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get(':eventId')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async findOneEvent(@Param() eventIdDto: EventIdDto) {
    try {
      const event: EventSpecificDto = await this.eventService.findSpecificEvent(eventIdDto);
      return event;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('서버 오류 발생');
    }
  }
}
