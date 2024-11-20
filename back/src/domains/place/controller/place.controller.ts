import {
  BadRequestException,
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  HttpStatus,
  InternalServerErrorException,
  Param,
  ParseIntPipe,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { PlaceCreationDto } from '../dto/placeCreation.dto';
import { SeatInfoDto } from '../dto/seatInfo.dto';
import { getSeatResponseExample } from '../example/response/getSeatResponseExample';
import { PlaceService } from '../service/place.service';

@ApiTags('Place')
@Controller('place')
@UseInterceptors(ClassSerializerInterceptor)
export class PlaceController {
  constructor(private readonly placeService: PlaceService) {}

  @ApiOperation({ summary: '장소의 좌석 정보를 가져오는 API' })
  @ApiParam({ name: 'place_id', description: '장소의 id', required: true, example: 1 })
  @ApiOkResponse({
    description: '장소의 좌석 정보를 가져옵니다.',
    type: SeatInfoDto,
    example: getSeatResponseExample,
  })
  @ApiBadRequestResponse({ description: '해당 장소가 존재하지 않습니다.' })
  @ApiForbiddenResponse({ description: '권한이 없습니다.' })
  @ApiInternalServerErrorResponse({ description: '서버 오류 발생' })
  //@UseGuards(SessionAuthGuard(USER_STATUS.SELECTING_SEAT))
  @Get('seats/:place_id')
  async getSeats(
    @Param('place_id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE })) placeId: number,
  ) {
    return this.placeService.getSeats(placeId);
  }

  @Post()
  @ApiOperation({ summary: '장소 추가[관리자]', description: '새로운 장소를 추가한다.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '장소 이름', example: '대극장' },
        address: { type: 'string', description: '장소 주소', example: '서울특별시' },
        'overview-svg': { type: 'string', description: 'overview SVG URL', example: '/overview.svg' },
        'overview-height': { type: 'number', description: '오버뷰 높이', example: 1000 },
        'overview-width': { type: 'number', description: '오버뷰 너비', example: 1500 },
        'overview-points': {
          type: 'json',
          description: '오버뷰 좌표',
          example: JSON.stringify({ x: 200, y: 300 }),
        },
      },
    },
  })
  @ApiCreatedResponse({ description: '장소 추가 성공' })
  @ApiBadRequestResponse({ description: '요청 데이터 누락, 타입 오류', type: Error })
  @ApiUnauthorizedResponse({ description: '관리자 권한 필요', type: Error })
  @ApiForbiddenResponse({ description: '인증되지 않은 요청', type: Error })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async createPlaceAndSection(@Body() placeCreationDto: PlaceCreationDto) {
    try {
      await this.placeService.createPlace(placeCreationDto);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('서버 내부 오류');
    }
  }
}
