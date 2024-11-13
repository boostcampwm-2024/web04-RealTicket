import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Event } from "../entity/event.entity";

@Injectable()
export class EventRepository {
  constructor(
    @InjectRepository(Event) private EventRepository: Repository<Event>
  ) { }

  async selectEvent(id: number): Promise<Event> {
    return await this.EventRepository.findOne({ where : { id }});
  }

}