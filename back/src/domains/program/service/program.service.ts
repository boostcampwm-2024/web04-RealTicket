import { Inject, Injectable } from '@nestjs/common';

import { AppException } from 'src/common/exception/app.exception';
import { Event } from 'src/domains/event/entity/event.entity';

import { PlaceMainPageDto } from '../dto/placeMainPage.dto';
import { ProgramCreationDto } from '../dto/programCreation.dto';
import { ProgramIdDto } from '../dto/programId.dto';
import { ProgramMainPageDto } from '../dto/programMainPage.dto';
import { ProgramSpecificDto } from '../dto/programSpecific.dto';
import { Program } from '../entities/program.entity';
import { ProgramErrorCode } from '../exception/program-error-code';
import { ProgramRepository } from '../repository/program.repository';

@Injectable()
export class ProgramService {
  constructor(@Inject() private programRepository: ProgramRepository) {}

  async findMainPageProgramData(): Promise<ProgramMainPageDto[]> {
    const programs: Program[] = await this.programRepository.selectAllProgramWithPlace();
    const programMainPageDtos: ProgramMainPageDto[] = await this.convertProgramListToMainPageDto(programs);

    return programMainPageDtos;
  }

  private async convertProgramListToMainPageDto(programs: Program[]) {
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
    const program: Program = await this.programRepository.selectProgramByIdWithPlaceAndEvent(programId);
    if (!program) throw new AppException(ProgramErrorCode.NOT_FOUND);
    const programSpecificdto: ProgramSpecificDto = await this.convertProgramToSpecificDto(program);
    return programSpecificdto;
  }

  private async convertProgramToSpecificDto(program: Program): Promise<ProgramSpecificDto> {
    const now = new Date();
    const [place, events] = await Promise.all([program.place, program.events]);
    const openedEvents: Event[] = events.filter((event) => {
      return event.reservationCloseDate >= now;
    });
    return new ProgramSpecificDto({ ...program, place, events: openedEvents });
  }

  async create(programCreationDto: ProgramCreationDto) {
    return await this.programRepository.storeProgram({
      ...programCreationDto,
      placeId: programCreationDto.placeId,
    });
  }

  async delete({ programId }: ProgramIdDto) {
    const result = await this.programRepository.deleteProgram(programId);
    if (!result.affected) throw new AppException(ProgramErrorCode.NOT_FOUND);
  }
}
