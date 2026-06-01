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
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { Request } from 'express';

import { SessionAuthGuard } from 'src/auth/guard/session.guard';
import { AuthService } from 'src/auth/service/auth.service';
import { ErrorResponseDto } from 'src/common/dto/error-response.dto';
import { SuccessResponseDto } from 'src/common/dto/success-response.dto';
import { USER_ROLE } from 'src/domains/user/const/userRole';

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
  @ApiExtraModels(SuccessResponseDto, ProgramMainPageDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'array', items: { $ref: getSchemaPath(ProgramMainPageDto) } } } },
      ],
    },
  })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  async findAllProgram(@Req() req: Request) {
    const sid = req.cookies['SID'];
    if (sid) {
      const session = await this.authService.getUserSession(sid);
      if (session) {
        await this.authService.resetToLogin(sid, null);
      }
    }

    const programs: ProgramMainPageDto[] = await this.programService.findMainPageProgramData();
    return programs;
  }

  @Get(':programId')
  @ApiOperation({ summary: '프로그램 세부 정보 조회', description: 'id값이 일치하는 프로그램을 조회한다.' })
  @ApiParam({ name: 'programId', description: '프로그램 아이디', type: Number })
  @ApiExtraModels(SuccessResponseDto, ProgramSpecificDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { $ref: getSchemaPath(ProgramSpecificDto) } } },
      ],
    },
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'PROGRAM_NOT_FOUND' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  async findOneProgram(@Param() programIdDto: ProgramIdDto) {
    const program: ProgramSpecificDto = await this.programService.findSpecificProgram(programIdDto);
    return program;
  }

  @Post()
  @ApiOperation({ summary: '프로그램 추가[관리자]', description: '새로운 프로그램을 추가한다.' })
  @UseGuards(SessionAuthGuard(USER_ROLE.ADMIN))
  @ApiBody({ type: ProgramCreationDto })
  @ApiCreatedResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', nullable: true } } },
      ],
    },
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'COMMON_INVALID_INPUT' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'PLACE_NOT_FOUND' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  async createProgram(@Body() programCreationDto: ProgramCreationDto) {
    return await this.programService.create(programCreationDto);
  }

  @Delete(':programId')
  @UseGuards(SessionAuthGuard(USER_ROLE.ADMIN))
  @ApiOperation({ summary: '프로그램 삭제[관리자]', description: 'id값이 일치하는 프로그램을 삭제한다.' })
  @ApiParam({ name: 'programId', description: '프로그램 아이디', type: Number })
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', nullable: true } } },
      ],
    },
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'COMMON_INVALID_INPUT' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'PROGRAM_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'PROGRAM_HAS_EVENTS' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  async deleteProgram(@Param() programIdDto: ProgramIdDto) {
    await this.programService.delete(programIdDto);
    return null;
  }
}
