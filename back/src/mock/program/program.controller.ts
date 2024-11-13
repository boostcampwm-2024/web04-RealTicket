import { Controller, Get, Param } from '@nestjs/common';

import { ProgramService } from './program.service';

@Controller('mock/programs')
export class ProgramController {
  constructor(private readonly programService: ProgramService) {}

  @Get()
  getPrograms() {
    return this.programService.getPrograms();
  }

  @Get(':programId')
  getProgramById(@Param('programId') programId: number) {
    return this.programService.getProgramById(programId);
  }
}
