import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Event } from '../entity/event.entity';

@Injectable()
export class EventRepository {
  constructor(@InjectRepository(Event) private EventRepository: Repository<Event>) {}

  async selectEvent(id: number): Promise<Event> {
    return await this.EventRepository.findOne({ where: { id } });
  }

  async storeEvent(data: any) {
    const event = this.EventRepository.create(data);
    return this.EventRepository.save(event);
  }

  async deleteProgram(id: number) {
    try {
      return await this.EventRepository.delete(id);
    } catch (error) {
      if (error.code === 'ER_ROW_IS_REFERENCED_2')
        throw new ConflictException('해당 프로그램에 대한 이벤트가 존재합니다.');
      throw error;
    }
  }
}
