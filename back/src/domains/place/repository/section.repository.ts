import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Section } from '../entity/section.entity';

@Injectable()
export class SectionRepository {
  constructor(@InjectRepository(Section) private sectionRepository: Repository<Section>) {}

  async selectSection(id: number): Promise<Section> {
    return await this.sectionRepository.findOne({ where: { id } });
  }

  async findByName(name: string): Promise<Section> {
    return await this.sectionRepository.findOne({ where: { name } });
  }
}
