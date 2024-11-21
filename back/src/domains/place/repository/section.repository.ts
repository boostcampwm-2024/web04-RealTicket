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

  async findById(id: number): Promise<Section> {
    return await this.sectionRepository.findOne({ where: { id } });
  }

  async storeSection(section: any): Promise<Section[]> {
    const secitonEntity = this.sectionRepository.create(section);
    return await this.sectionRepository.save(secitonEntity);
  }

  async deleteByPlaceId(placeId: number): Promise<void> {
    await this.sectionRepository.delete({ place: { id: placeId } });
  }
}
