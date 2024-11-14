import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ProgramController } from './controller/program.controller';
import { Program } from './entities/program.entity';
import { ProgramRepository } from './repository/program.repository';
import { ProgramService } from './service/program.service';

@Module({
  imports: [TypeOrmModule.forFeature([Program])],
  controllers: [ProgramController],
  providers: [ProgramService, ProgramRepository],
})
export class ProgramModule {}
