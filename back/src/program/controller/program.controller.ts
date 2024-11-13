import { Controller, Get, InternalServerErrorException, Param } from '@nestjs/common';
import { ProgramService } from '../service/program.service';
import { ProgramMainPageDto } from '../dto/programMainPageDto';

@Controller('programs')
export class ProgramController {
  constructor(private readonly programService: ProgramService) {}

  @Get()
  async findAllProgram() {
    try {
      const programs: ProgramMainPageDto[] = await this.programService.findMainPageProgramData();
      return programs;
    } catch (error) {
      throw new InternalServerErrorException('서버 오류 발생');
    }
  }

  @Get(':id')
  findOneProgram(@Param('id') id: number) {
    return this.programService.findOne(+id);
  }
}
