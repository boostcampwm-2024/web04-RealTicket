import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { Program } from '../entities/program.entity';

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
        throw new NotFoundException(`해당 장소[${data.placeId}]는 존재하지 않습니다.`);
      }
      throw error;
    }
  }

  async deleteProgram(id: number) {
    try {
      return await this.ProgramRepository.delete(id);
    } catch (error) {
      if (error.code === 'ER_ROW_IS_REFERENCED_2')
        throw new ConflictException('해당 프로그램에 대한 이벤트가 존재합니다.');
      throw error;
    }
  }
}
