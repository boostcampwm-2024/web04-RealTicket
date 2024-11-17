import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Place } from '../entity/place.entity';

@Injectable()
export class PlaceRepository {
  constructor(@InjectRepository(Place) private PlaceRepository: Repository<Place>) {}

  async selectPlace(id: number): Promise<Place> {
    return await this.PlaceRepository.findOne({ where: { id } });
  }
}
