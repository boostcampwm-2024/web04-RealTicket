import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { PlaceRepository } from 'src/domains/place/repository/place.repository';

import { PlaceMainPageDto } from '../dto/placeMainPageDto';
import { ProgramCreationDto } from '../dto/programCreationDto';
import { ProgramIdDto } from '../dto/programIdDto';
import { ProgramMainPageDto } from '../dto/programMainPageDto';
import { ProgramSpecificDto } from '../dto/programSpecificDto';
import { Program } from '../entities/program.entity';
import { ProgramRepository } from '../repository/program.repository';

@Injectable()
export class ProgramService {
  constructor(
    @Inject() private programRepository: ProgramRepository,
    @Inject() private placeRepository: PlaceRepository,
  ) {}

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

  async create(programCreationDto: ProgramCreationDto): Promise<void> {
    const place = await this.placeRepository.selectPlace(programCreationDto.placeId);
    if (!place) throw new NotFoundException(`해당 장소[${programCreationDto.placeId}]가 없습니다.`);

    await this.programRepository.storeProgram({ ...programCreationDto, place });
  }

  async delete({ programId }: ProgramIdDto) {
    const result = await this.programRepository.deleteProgram(programId);
    if (!result.affected) throw new NotFoundException(`해당 프로그램[${programId}]가 없습니다.`);
  }
}
