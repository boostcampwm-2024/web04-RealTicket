import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { Event } from '../entity/event.entity';

@Injectable()
export class EventRepository {
  private eventRepository: Repository<Event>;

  constructor(private readonly dataSource: DataSource) {
    this.eventRepository = this.dataSource.getRepository(Event);
  }

  async findOne(id: number): Promise<any> {
    //return this.eventRepository.findOne({ where: { id: id } });
    return { ...MockEvent, id: id };
  }
}

const MockEvent = {
  id: 1,
  runningDate: new Date('2024-12-20T18:00:00Z'),
  reservationOpenDate: new Date('2024-11-13T01:00:00Z'),
  reservationCloseDate: new Date('2024-11-19T18:00:00Z'),
  seatStatus: [
    [0, 1],
    [1, 0],
  ],
  program: {
    id: 1,
    name: 'Music Concert',
    description: 'An outdoor music concert event.',
    events: [],
  },
  place: {
    id: 1,
    name: 'Central Park',
    location: 'New York',
    events: [],
  },
  reservations: [
    {
      id: 1,
      userId: 101,
      reservationDate: '2024-11-02T10:30:00Z',
    },
    {
      id: 2,
      userId: 102,
      reservationDate: '2024-11-05T12:00:00Z',
    },
  ],
};
