import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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

import { USER_STATUS } from 'src/auth/const/userStatus.const';
import { SessionAuthGuard } from 'src/auth/guard/session.guard';
import { ErrorResponseDto } from 'src/common/dto/error-response.dto';
import { SuccessResponseDto } from 'src/common/dto/success-response.dto';

import { EventCreationDto } from '../dto/eventCreation.dto';
import { EventIdDto } from '../dto/eventId.dto';
import { EventSpecificDto } from '../dto/eventSpecific.dto';
import { EventService } from '../service/event.service';

@Controller('event')
@UseInterceptors(ClassSerializerInterceptor)
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get(':eventId')
  @UseGuards(SessionAuthGuard())
  @ApiOperation({ summary: '이벤트 세부 정보 조회', description: 'id값이 일치하는 이벤트를 조회한다.' })
  @ApiParam({ name: 'eventId', description: '이벤트 아이디', type: Number })
  @ApiExtraModels(SuccessResponseDto, EventSpecificDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { $ref: getSchemaPath(EventSpecificDto) } } },
      ],
    },
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'EVENT_NOT_FOUND' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  async findOneEvent(@Param() eventIdDto: EventIdDto) {
    const event: EventSpecificDto = await this.eventService.findSpecificEvent(eventIdDto);
    return event;
  }

  @Post()
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({ summary: '이벤트 추가[관리자]', description: '새로운 이벤트를 추가한다.' })
  @ApiBody({ type: EventCreationDto })
  @ApiCreatedResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object' } } },
      ],
    },
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'COMMON_INVALID_INPUT' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'PROGRAM_NOT_FOUND' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  async createEvent(@Body() eventCreationDto: EventCreationDto) {
    return await this.eventService.create(eventCreationDto);
  }

  @Delete(':eventId')
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({ summary: '이벤트 삭제[관리자]', description: 'id값이 일치하는 이벤트를 삭제한다.' })
  @ApiParam({ name: 'eventId', description: '이벤트 아이디', type: Number })
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
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'EVENT_NOT_FOUND' })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'COMMON_CONFLICT' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  async deleteProgram(@Param() eventIdDto: EventIdDto) {
    await this.eventService.delete(eventIdDto);
  }
}
