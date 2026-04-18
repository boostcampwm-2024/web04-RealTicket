import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { AppException } from '../../../common/exception/app.exception';
import { Program } from '../entities/program.entity';
import { ProgramErrorCode } from '../exception/program-error-code';

@Injectable()
export class ProgramRepository {
  constructor(@InjectRepository(Program) private ProgramRepository: Repository<Program>) {}

  async selectAllProgramWithPlace(): Promise<Program[]> {
    return await this.ProgramRepository.find({
      relations: ['place'],
    });
  }

  async selectProgramWithPlace(id: number): Promise<Program> {
    return await this.ProgramRepository.findOne({
      where: { id },
      relations: ['place'],
    });
  }

  async selectProgramByIdWithPlaceAndEvent(id: number): Promise<Program> {
    return await this.ProgramRepository.findOne({
      where: { id },
      relations: ['place', 'events'],
    });
  }

  async storeProgram(data: any) {
    try {
      const program = this.ProgramRepository.create({
        ...data,
        place: { id: data.placeId },
      });
      return await this.ProgramRepository.save(program);
    } catch (error) {
      if (error instanceof QueryFailedError) {
        throw new AppException(ProgramErrorCode.NOT_FOUND);
      }
      throw error;
    }
  }

  async deleteProgram(id: number) {
    try {
      return await this.ProgramRepository.delete(id);
    } catch (error) {
      if (
        error.code === 'ER_ROW_IS_REFERENCED_2' ||
        (error instanceof QueryFailedError && error.message.includes('FOREIGN KEY constraint failed'))
      )
        throw new AppException(ProgramErrorCode.HAS_EVENTS);
      throw error;
    }
  }
}
