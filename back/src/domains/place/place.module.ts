import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProgramModule } from '../program/program.module';

import { Place } from './entity/place.entity';
import { PlaceRepository } from './repository/place.repository';
import { PlaceService } from './service/place.service';

@Module({
  imports: [TypeOrmModule.forFeature([Place]), forwardRef(() => ProgramModule)],
  providers: [PlaceService, PlaceRepository],
  exports: [PlaceRepository],
})
export class PlaceModule {}
