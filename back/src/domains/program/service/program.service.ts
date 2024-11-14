import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { PlaceMainPageDto } from '../dto/placeMainPageDto';
import { ProgramIdDto } from '../dto/programIdDto';
import { ProgramMainPageDto } from '../dto/programMainPageDto';
import { ProgramSpecificDto } from '../dto/programSpecificDto';
import { Program } from '../entities/program.entity';
import { ProgramRepository } from '../repository/program.repository';

@Injectable()
export class ProgramService {
  constructor(@Inject() private programRepository: ProgramRepository) {}

  async findMainPageProgramData() {
    const programs: Program[] = await this.programRepository.selectAllProgram();
    const programMainPageDtos: ProgramMainPageDto[] = await this.#convertProgramListToMainPageDto(programs);

    return programMainPageDtos;
  }

  async #convertProgramListToMainPageDto(programs: Program[]) {
    return Promise.all(
      programs.map(async (program: Program) => {
        const place = await program.place;
        return new ProgramMainPageDto({
          ...program,
          place: new PlaceMainPageDto(place),
        });
      }),
    );
  }

  async findSpecificProgram({ programId }: ProgramIdDto): Promise<ProgramSpecificDto> {
    const program: Program = await this.programRepository.selectProgram(programId);

    if (!program) throw new NotFoundException(`해당 프로그램[${programId}]는 존재하지 않습니다.`);
    const programSpecificdto: ProgramSpecificDto = await this.#convertProgramToSpecificDto(program);
    return programSpecificdto;
  }

  async #convertProgramToSpecificDto(program: Program): Promise<ProgramSpecificDto> {
    const [place, events] = await Promise.all([program.place, program.events]);

    return new ProgramSpecificDto({ ...program, place, events });
  }
}
