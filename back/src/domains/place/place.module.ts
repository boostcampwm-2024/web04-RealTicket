import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Place } from './entity/place.entity';
import { PlaceRepository } from './repository/place.repository';
import { PlaceService } from './service/place.service';

@Module({
  imports: [TypeOrmModule.forFeature([Place])],
  providers: [PlaceService, PlaceRepository],
  exports: [PlaceRepository],
})
export class PlaceModule {}
