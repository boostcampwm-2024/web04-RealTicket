import {
  BadRequestException,
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { EventCreationDto } from '../dto/eventCreationDto';
import { EventIdDto } from '../dto/eventIdDto';
import { EventSpecificDto } from '../dto/eventSpecificDto';
import { EventService } from '../service/event.service';

@Controller('event')
@UseInterceptors(ClassSerializerInterceptor)
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get(':eventId')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @ApiOperation({ summary: '이벤트 세부 정보 조회', description: 'id값이 일치하는 이벤트를 조회한다.' })
  @ApiParam({ name: 'eventId', description: '이벤트 아이디', type: Number })
  @ApiOkResponse({ description: '이벤트 조회 성공', type: EventSpecificDto })
  @ApiNotFoundResponse({ description: 'id가 일치하는 이벤트 미존재', type: Error })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async findOneEvent(@Param() eventIdDto: EventIdDto) {
    try {
      const event: EventSpecificDto = await this.eventService.findSpecificEvent(eventIdDto);
      return event;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('서버 오류 발생');
    }
  }

  @Post()
  @ApiOperation({ summary: '이벤트 추가[관리자]', description: '새로운 이벤트를 추가한다.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        'running-date': { type: 'date', description: '이벤트 시작 시간', example: '2024-11-18T01:00:00Z' },
        'reservation-open-date': {
          type: 'date',
          description: '이벤트 예매 오픈 시간',
          example: '2024-11-16T01:00:00Z',
        },
        'reservation-close-date': {
          type: 'date',
          description: '이벤트 예매 마감 시간',
          example: '2024-11-178T01:00:00Z',
        },
        'program-id': { type: 'number', description: '프로그램 아이디', example: 1 },
      },
    },
  })
  @ApiCreatedResponse({ description: '이벤트 추가 성공' })
  @ApiBadRequestResponse({ description: '요청 데이터 누락, 타입 오류', type: Error })
  @ApiUnauthorizedResponse({ description: '관리자 권한 필요', type: Error })
  @ApiForbiddenResponse({ description: '인증되지 않은 요청', type: Error })
  @ApiNotFoundResponse({ description: '프로그램이 존재하지 않음', type: Error })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async createEvent(@Body() eventCreationDto: EventCreationDto) {
    try {
      await this.eventService.create(eventCreationDto);
    } catch (error) {
      if (error instanceof BadRequestException || NotFoundException) throw error;
      throw new InternalServerErrorException('서버 오류 발생');
    }
  }
}
