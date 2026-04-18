import { Inject, Injectable } from '@nestjs/common';

import { AppException } from 'src/common/exception/app.exception';
import { Place } from 'src/domains/place/entity/place.entity';
import { Program } from 'src/domains/program/entities/program.entity';
import { ProgramRepository } from 'src/domains/program/repository/program.repository';

import { EventDto } from '../dto/event.dto';
import { EventCreationDto } from '../dto/eventCreation.dto';
import { EventIdDto } from '../dto/eventId.dto';
import { EventSpecificDto } from '../dto/eventSpecific.dto';
import { Event } from '../entity/event.entity';
import { EventErrorCode } from '../exception/event-error-code';
import { EventRepository } from '../repository/event.reposiotry';

@Injectable()
export class EventService {
  constructor(
    @Inject() private readonly eventRepository: EventRepository,
    @Inject() private readonly programRepository: ProgramRepository,
  ) {}

  async findEvent({ eventId }: EventIdDto): Promise<EventDto> {
    const event: Event = await this.eventRepository.selectEvent(eventId);
    if (!event) throw new AppException(EventErrorCode.NOT_FOUND);
    return this.#convertEventToDto(event);
  }

  #convertEventToDto(event: Event): EventDto {
    return new EventDto({
      ...event,
    });
  }

  async findSpecificEvent({ eventId }: EventIdDto): Promise<EventSpecificDto> {
    const event: Event = await this.eventRepository.selectEventWithPlaceAndProgram(eventId);
    if (!event) throw new AppException(EventErrorCode.NOT_FOUND);
    const eventSpecificDto: EventSpecificDto = await this.#convertEventToSpecificDto(event);
    return eventSpecificDto;
  }

  async #convertEventToSpecificDto(event: Event): Promise<EventSpecificDto> {
    const [place, program] = await Promise.all([event.place, event.program]);
    return new EventSpecificDto({
      ...event,
      name: program.name,
      runningTime: program.runningTime,
      price: program.price,
      place,
    });
  }

  async create(eventCreationDto: EventCreationDto) {
    this.validateEventDate(eventCreationDto);
    const program: Program = await this.programRepository.selectProgramWithPlace(eventCreationDto.programId);
    if (!program) throw new AppException(EventErrorCode.NOT_FOUND);
    const place: Place = await program.place;
    if (!program.place) throw new AppException(EventErrorCode.NOT_FOUND);

    return await this.eventRepository.storeEvent({ ...eventCreationDto, program, place });
  }

  private validateEventDate({
    runningDate,
    reservationOpenDate,
    reservationCloseDate,
  }: {
    runningDate: Date;
    reservationOpenDate: Date;
    reservationCloseDate: Date;
  }) {
    if (reservationOpenDate < reservationCloseDate && reservationCloseDate <= runningDate) {
      return;
    }
    throw new AppException(EventErrorCode.INVALID_DATE);
  }

  async delete({ eventId }: EventIdDto) {
    const result = await this.eventRepository.deleteProgram(eventId);
    if (!result.affected) throw new AppException(EventErrorCode.NOT_FOUND);
  }
}
