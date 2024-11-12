import { Controller, Get, Param } from '@nestjs/common';

import { ProgramService } from './program.service';

@Controller('program')
export class ProgramController {
  constructor(private readonly programService: ProgramService) {}

  @Get()
  findAll() {
    return this.programService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.programService.findOne(+id);
  }
}
