import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';

import { USER_STATUS } from 'src/auth/const/userStatus.const';
import { SessionAuthGuard } from 'src/auth/guard/session.guard';
import { AuthService } from 'src/auth/service/auth.service';

import { ProgramCreationDto } from '../dto/programCreation.dto';
import { ProgramIdDto } from '../dto/programId.dto';
import { ProgramMainPageDto } from '../dto/programMainPage.dto';
import { ProgramSpecificDto } from '../dto/programSpecific.dto';
import { ProgramService } from '../service/program.service';

@Controller('program')
@UseInterceptors(ClassSerializerInterceptor)
export class ProgramController {
  constructor(
    private readonly programService: ProgramService,
    private readonly authService: AuthService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '프로그램 전체 목록 조회',
    description: 'DB에 저장된 프로그램 전체 목록을 조회한다.',
  })
  @ApiOkResponse({ description: '프로그램 전체 목록 조회 성공', type: ProgramMainPageDto, isArray: true })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async findAllProgram(@Req() req: Request) {
    const sid = req.cookies['SID'];
    if (sid) {
      const session = await this.authService.getUserSession(sid);
      if (session && session.userStatus !== USER_STATUS.ADMIN) {
        await this.authService.setUserStatusLogin(sid);
      }
    }

    const programs: ProgramMainPageDto[] = await this.programService.findMainPageProgramData();
    return programs;
  }

  @Get(':programId')
  @ApiOperation({ summary: '프로그램 세부 정보 조회', description: 'id값이 일치하는 프로그램을 조회한다.' })
  @ApiParam({ name: 'programId', description: '프로그램 아이디', type: Number })
  @ApiOkResponse({ description: '프로그램 조회 성공', type: ProgramSpecificDto })
  @ApiNotFoundResponse({ description: 'id가 일치하는 프로그램 미존재', type: Error })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async findOneProgram(@Param() programIdDto: ProgramIdDto) {
    const program: ProgramSpecificDto = await this.programService.findSpecificProgram(programIdDto);
    return program;
  }

  @Post()
  @ApiOperation({ summary: '프로그램 추가[관리자]', description: '새로운 프로그램을 추가한다.' })
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '프로그램 이름', example: '맘마미아' },
        profileUrl: { type: 'string', description: '프로그램 사진 URL', example: '/profile.png' },
        runningTime: { type: 'number', description: '프로그램 진행 시간(초)', example: 10000 },
        genre: { type: 'string', description: '프로그램 장르', example: '뮤지컬' },
        actors: { type: 'string', description: '출연진(들)', example: '김동현, 김동현' },
        price: { type: 'number', description: '입장권 가격', example: 15000 },
        placeId: { type: 'number', description: '장소 아이디', example: 1 },
      },
    },
  })
  @ApiCreatedResponse({ description: '프로그램 추가 성공' })
  @ApiBadRequestResponse({ description: '요청 데이터 누락, 타입 오류', type: Error })
  @ApiUnauthorizedResponse({ description: '관리자 권한 필요', type: Error })
  @ApiForbiddenResponse({ description: '인증되지 않은 요청', type: Error })
  @ApiNotFoundResponse({ description: '장소가 존재하지 않음', type: Error })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async createProgram(@Body() programCreationDto: ProgramCreationDto) {
    return await this.programService.create(programCreationDto);
  }

  @Delete(':programId')
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({ summary: '프로그램 삭제[관리자]', description: 'id값이 일치하는 프로그램을 삭제한다.' })
  @ApiParam({ name: 'programId', description: '프로그램 아이디', type: Number })
  @ApiOkResponse({ description: '프로그램 삭제 성공' })
  @ApiBadRequestResponse({ description: '요청 데이터 누락, 타입 오류', type: Error })
  @ApiUnauthorizedResponse({ description: '관리자 권한 필요', type: Error })
  @ApiForbiddenResponse({ description: '인증되지 않은 요청', type: Error })
  @ApiNotFoundResponse({ description: 'id가 일치하는 프로그램 미존재', type: Error })
  @ApiConflictResponse({ description: '관련 이벤트가 존재해 프로그램 삭제 불가', type: Error })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async deleteProgram(@Param() programIdDto: ProgramIdDto) {
    await this.programService.delete(programIdDto);
  }
}
