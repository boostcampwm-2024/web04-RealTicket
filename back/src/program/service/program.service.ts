import { Inject, Injectable } from '@nestjs/common';

import { PlaceMainPageDto } from '../Dto/placeMainPageDto';
import { ProgramMainPageDto } from '../Dto/programMainPageDto';
import { Program } from '../entities/program.entity';
import { ProgramRepository } from '../repository/program.repository';

@Injectable()
export class ProgramService {
  constructor(@Inject() private programRepository: ProgramRepository) {}

  async findMainPageProgramData() {
    const programs: Program[] = await this.programRepository.selectAllProgram();
    const programMainPageDtos = this.#convertProgramListToMainPageDto(programs);
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

  findOne(id: number) {
    return `This action returns a #${id} program`;
  }
}
