import {
  BadRequestException,
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { NotFoundError } from 'rxjs';

import { PlaceCreationDto } from '../dto/placeCreation.dto';
import { PlaceIdDto } from '../dto/placeId.dto';
import { SeatInfoDto } from '../dto/seatInfo.dto';
import { SectionCreationDto } from '../dto/sectionCreation.dto';
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
  async createPlace(@Body() placeCreationDto: PlaceCreationDto) {
    try {
      await this.placeService.createPlace(placeCreationDto);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new InternalServerErrorException('서버 내부 오류');
    }
  }

  @Delete(':placeId')
  @ApiOperation({ summary: '장소 삭제[관리자]', description: 'placeId에 해당하는 장소를 삭제한다' })
  @ApiParam({ name: 'placeId', description: '장소 아이디', type: Number, example: 1 })
  @ApiOkResponse({ description: '장소 삭제 성공' })
  @ApiBadRequestResponse({ description: '요청 데이터 누락, 타입 오류', type: Error })
  @ApiUnauthorizedResponse({ description: '관리자 권한 필요', type: Error })
  @ApiForbiddenResponse({ description: '인증되지 않은 요청', type: Error })
  @ApiNotFoundResponse({ description: '장소가 존재하지 않음', type: Error })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async deletePlace(@Param() placeIdDto: PlaceIdDto) {
    try {
      await this.placeService.deletePlace(placeIdDto);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('서버 내부 오류');
    }
  }

  @Post('section')
  @ApiOperation({ summary: '섹션 추가[관리자]', description: '특정 장소에 섹션들을 추가한다' })
  @ApiBody({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '섹션 이름', example: 's1' },
          'col-len': { type: 'integer', description: '섹션의 열 길이', example: 2 },
          seats: {
            type: 'array',
            description: '자리 존재 여부를 나타내는 값',
            items: { type: 'boolean' },
            example: [true, true],
          },
          'place-id': { type: 'integer', description: 'place 장소 아이디', example: 1 },
          order: { type: 'integer', description: '해당 섹션의 순서', example: 2 },
        },
      },
    },
  })
  @ApiCreatedResponse({ description: '섹션 추가 성공' })
  @ApiBadRequestResponse({ description: '요청 데이터 누락, 타입 오류, 동일하지 않은 placeId', type: Error })
  @ApiUnauthorizedResponse({ description: '관리자 권한 필요', type: Error })
  @ApiForbiddenResponse({ description: '인증되지 않은 요청', type: Error })
  @ApiNotFoundResponse({ description: '섹션이 위치할 장소가 존재하지 않음', type: Error })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async createSection(@Body() sectinoCreationDtoList: SectionCreationDto[]) {
    try {
      const placeId = this.validatePlaceId(sectinoCreationDtoList);
      await this.placeService.createSections(sectinoCreationDtoList, placeId);
    } catch (error) {
      if (error instanceof NotFoundError || BadRequestException) throw error;
      throw new InternalServerErrorException('서버 내부 오류');
    }
  }

  private validatePlaceId(sectionCreationDtoList: SectionCreationDto[]): number {
    const placeId = sectionCreationDtoList[0].placeId;
    if (sectionCreationDtoList.filter((sectionDto) => sectionDto.placeId !== placeId).length) {
      throw new BadRequestException('섹션은 모두 동일한 place에 삽입해야 합니다.');
    }
    return placeId;
  }
}
