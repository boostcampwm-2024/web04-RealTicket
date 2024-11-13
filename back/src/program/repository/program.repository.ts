import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Program } from '../entities/program.entity';

@Injectable()
export class ProgramRepository {
  constructor(@InjectRepository(Program) private ProgramRepository: Repository<Program>) {}

  async selectAllProgram(): Promise<Program[]> {
    return await this.ProgramRepository.find();
  }

  async selectProgram(id: number): Promise<Program> {
    return await this.ProgramRepository.findOne({ where: { id } });
  }
}
