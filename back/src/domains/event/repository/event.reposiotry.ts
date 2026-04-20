import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';

import { AppException } from 'src/common/exception/app.exception';

import { Event } from '../entity/event.entity';
import { EventErrorCode } from '../exception/event-error-code';

@Injectable()
export class EventRepository {
  constructor(@InjectRepository(Event) private EventRepository: Repository<Event>) {}

  async selectEvents(): Promise<Event[]> {
    return await this.EventRepository.find();
  }

  async selectEvent(id: number): Promise<Event> {
    return await this.EventRepository.findOne({ where: { id } });
  }

  async selectEventWithPlaceAndProgram(id: number): Promise<Event> {
    return await this.EventRepository.findOne({
      where: { id },
      relations: ['place', 'program'],
    });
  }

  async selectEventWithPlaceAndProgramAndPlace(id: number): Promise<Event> {
    return await this.EventRepository.findOne({
      where: { id },
      relations: ['place', 'program', 'program.place'],
    });
  }

  async selectUpcomingEvents(): Promise<Event[]> {
    const now = new Date();

    return await this.EventRepository.find({
      where: {
        reservationCloseDate: MoreThan(now),
      },
      relations: ['place'],
      order: {
        reservationOpenDate: 'ASC',
      },
    });
  }

  async storeEvent(data: any) {
    const event = this.EventRepository.create(data);
    return await this.EventRepository.save(event);
  }

  async deleteProgram(id: number) {
    try {
      return await this.EventRepository.delete(id);
    } catch (error) {
      if (error.code === 'ER_ROW_IS_REFERENCED_2') throw new AppException(EventErrorCode.PROGRAM_HAS_EVENTS);
      throw error;
    }
  }
}
