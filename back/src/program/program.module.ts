import { Module } from '@nestjs/common';

import { ProgramController } from './controller/program.controller';
import { ProgramService } from './service/program.service';
import { ProgramRepository } from './repository/program.repository';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Program } from './entities/program.entity';

@Module({
  imports: [    
    TypeOrmModule.forFeature([Program]),
  ],
  controllers: [ProgramController],
  providers: [ProgramService, ProgramRepository],
})

export class ProgramModule {}
