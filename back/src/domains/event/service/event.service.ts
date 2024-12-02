import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

import { Place } from 'src/domains/place/entity/place.entity';
import { Program } from 'src/domains/program/entities/program.entity';
import { ProgramRepository } from 'src/domains/program/repository/program.repository';

import { EventDto } from '../dto/event.dto';
import { EventCreationDto } from '../dto/eventCreation.dto';
import { EventIdDto } from '../dto/eventId.dto';
import { EventSpecificDto } from '../dto/eventSpecific.dto';
import { Event } from '../entity/event.entity';
import { EventRepository } from '../repository/event.reposiotry';

@Injectable()
export class EventService {
  constructor(
    @Inject() private readonly eventRepository: EventRepository,
    @Inject() private readonly programRepository: ProgramRepository,
  ) {}

  async findEvent({ eventId }: EventIdDto): Promise<EventDto> {
    const event: Event = await this.eventRepository.selectEvent(eventId);
    if (!event) throw new NotFoundException(`해당 이벤트[${eventId}]는존재하지 않습니다.`);
    return this.#convertEventToDto(event);
  }

  #convertEventToDto(event: Event): EventDto {
    return new EventDto({
      ...event,
    });
  }

  async findSpecificEvent({ eventId }: EventIdDto): Promise<EventSpecificDto> {
    const event: Event = await this.eventRepository.selectEventWithPlaceAndProgram(eventId);
    if (!event) throw new NotFoundException(`해당 이벤트[${eventId}]는존재하지 않습니다.`);
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

  async create(eventCreationDto: EventCreationDto): Promise<void> {
    this.validateEventDate(eventCreationDto);
    const program: Program = await this.programRepository.selectProgramWithPlace(eventCreationDto.programId);
    if (!program) throw new NotFoundException(`해당 프로그램[${eventCreationDto.programId}]가 없습니다.`);
    const place: Place = await program.place;
    if (!program.place)
      throw new NotFoundException(`해당 프로그램[${eventCreationDto.programId}]의 장소가 없습니다.`);

    await this.eventRepository.storeEvent({ ...eventCreationDto, program, place });
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
    throw new BadRequestException('에약오픈일자 < 예약마감일자 <= 시작날짜 형식이어야 합니다.');
  }

  async delete({ eventId }: EventIdDto) {
    const result = await this.eventRepository.deleteProgram(eventId);
    if (!result.affected) throw new NotFoundException(`해당 이벤트[${eventId}]가 없습니다.`);
  }
}
