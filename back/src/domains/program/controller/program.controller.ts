import {
  ClassSerializerInterceptor,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';

import { ProgramIdDto } from '../dto/programIdDto';
import { ProgramMainPageDto } from '../dto/programMainPageDto';
import { ProgramSpecificDto } from '../dto/programSpecificDto';
import { ProgramService } from '../service/program.service';

@Controller('program')
@UseInterceptors(ClassSerializerInterceptor)
export class ProgramController {
  constructor(private readonly programService: ProgramService) {}

  @Get()
  @ApiOperation({
    summary: '프로그램 전체 목록 조회',
    description: 'DB에 저장된 프로그램 전체 목록을 조회한다.',
  })
  @ApiOkResponse({ description: '프로그램 전체 목록 조회 성공', type: ProgramMainPageDto, isArray: true })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async findAllProgram() {
    try {
      const programs: ProgramMainPageDto[] = await this.programService.findMainPageProgramData();
      return programs;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      throw new InternalServerErrorException('서버 오류 발생');
    }
  }

  @Get(':programId')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: '프로그램 세부 정보 조회', description: 'id값이 일치하는 프로그램을 조회한다.' })
  @ApiParam({ name: 'programId', description: '프로그램 아이디', type: Number })
  @ApiOkResponse({ description: '프로그램 조회 성공', type: ProgramSpecificDto })
  @ApiNotFoundResponse({ description: 'id가 일치하는 프로그램 미존재', type: Error })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async findOneProgram(@Param() programIdDto: ProgramIdDto) {
    try {
      const program: ProgramSpecificDto = await this.programService.findSpecificProgram(programIdDto);
      return program;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('서버 오류 발생');
    }
  }
}
