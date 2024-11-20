import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Place } from '../entity/place.entity';

import { SectionRepository } from './section.repository';

@Injectable()
export class PlaceRepository {
  constructor(
    @InjectRepository(Place) private PlaceRepository: Repository<Place>,
    private readonly dataSource: DataSource,
    private readonly SectionRepository: SectionRepository,
  ) {}

  async selectPlace(id: number): Promise<Place> {
    return await this.PlaceRepository.findOne({ where: { id } });
  }

  storePlace(data: any) {
    const place = this.PlaceRepository.create(data);
    return this.PlaceRepository.save(place);
  }

  async updateSectionsById(orders: string[], id: number) {
    return await this.PlaceRepository.update({ id }, { sections: orders });
  }

  async deleteById(id: number) {
    await this.dataSource.transaction(async () => {
      await this.SectionRepository.deleteByPlaceId(id);
      const result = await this.PlaceRepository.delete(id);
      if (!result.affected) throw new NotFoundException(`해당 장소[${id}]가 존재하지 않습니다.`);
    });
  }
}
