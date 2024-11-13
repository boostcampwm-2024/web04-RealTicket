import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventRepository } from '../repository/event.reposiotry';
import { EventIdDto } from '../dto/eventIdDto';
import { EventSpecificDto } from '../dto/eventSpecificDto';
import { Event } from '../entity/event.entity';

@Injectable()
export class EventService {
  constructor(@Inject() private readonly eventRepository: EventRepository) {}

  async findSpecificEvent({eventId}: EventIdDto): Promise<EventSpecificDto> {
    const event: Event = await this.eventRepository.selectEvent(eventId);
    if (!event) throw new NotFoundException(`해당 이벤트[${eventId}]는존재하지 않습니다.`);
    const eventSpecificDto: EventSpecificDto = await this.#convertEventToSpecificDto(event);
    return eventSpecificDto;
  }

  async #convertEventToSpecificDto(event: Event): Promise<EventSpecificDto> {
    const [place, program] = await Promise.all([
      event.place,
      event.program,
    ]);
    return new EventSpecificDto({
      ...event,
      name: program.name,
      runningTime: program.runningTime,
      place,
    });
  }
  
}
