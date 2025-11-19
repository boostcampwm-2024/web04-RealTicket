import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../../auth/auth.module';
import { PlaceModule } from '../place/place.module';

import { ProgramController } from './controller/program.controller';
import { Program } from './entities/program.entity';
import { ProgramRepository } from './repository/program.repository';
import { ProgramService } from './service/program.service';

@Module({
  imports: [TypeOrmModule.forFeature([Program]), forwardRef(() => PlaceModule), AuthModule],
  controllers: [ProgramController],
  providers: [ProgramService, ProgramRepository],
  exports: [ProgramRepository],
})
export class ProgramModule {}
