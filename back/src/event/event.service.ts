import { BadRequestException, Injectable } from '@nestjs/common';

import { EventRepository } from './repository/event.repository';

@Injectable()
export class EventService {
  constructor(private readonly eventRepository: EventRepository) {}
  async getEventInfo(id: number) {
    try {
      return await this.eventRepository.findOne(id);
    } catch (err) {
      console.log(err);
      throw new BadRequestException('존재하지 않는 이벤트 입니다.');
    }
  }
}
