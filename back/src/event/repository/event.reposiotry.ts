import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class EventRepository {
  constructor(
    @InjectRepository(Event) private ProgramRepository: Repository<Event>
  ) { }

}