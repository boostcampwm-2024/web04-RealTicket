import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProgramModule } from '../program/program.module';

import { PlaceController } from './controller/place.controller';
import { Place } from './entity/place.entity';
import { Section } from './entity/section.entity';
import { PlaceRepository } from './repository/place.repository';
import { SectionRepository } from './repository/section.repository';
import { PlaceService } from './service/place.service';

@Module({
  imports: [TypeOrmModule.forFeature([Place, Section]), forwardRef(() => ProgramModule)],
  providers: [PlaceService, PlaceRepository, SectionRepository],
  controllers: [PlaceController],
  exports: [PlaceRepository, SectionRepository],
})
export class PlaceModule {}
