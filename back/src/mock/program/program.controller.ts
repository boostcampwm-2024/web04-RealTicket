import { Controller } from '@nestjs/common';

import { ProgramService } from './program.service';

@Controller('mock/programs')
export class ProgramController {
  constructor(private readonly programService: ProgramService) {}
}
