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
}
