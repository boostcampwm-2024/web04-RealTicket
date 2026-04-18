import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
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

import { USER_STATUS } from 'src/auth/const/userStatus.const';
import { SessionAuthGuard } from 'src/auth/guard/session.guard';
import { AppException } from 'src/common/exception/app.exception';

import { PlaceCreationDto } from '../dto/placeCreation.dto';
import { PlaceIdDto } from '../dto/placeId.dto';
import { SeatInfoDto } from '../dto/seatInfo.dto';
import { SectionCreationDto } from '../dto/sectionCreation.dto';
import { getSeatResponseExample } from '../example/response/getSeatResponseExample';
import { PlaceErrorCode } from '../exception/place-error-code';
import { PlaceService } from '../service/place.service';

@ApiTags('Place')
@Controller('place')
@UseInterceptors(ClassSerializerInterceptor)
export class PlaceController {
  constructor(private readonly placeService: PlaceService) {}

  @ApiOperation({ summary: '장소의 좌석 정보를 가져오는 API' })
  @ApiParam({ name: 'placeId', description: '장소의 id', required: true, example: 1 })
  @ApiOkResponse({
    description: '장소의 좌석 정보를 가져옵니다.',
    type: SeatInfoDto,
    example: getSeatResponseExample,
  })
  @ApiBadRequestResponse({ description: '해당 장소가 존재하지 않습니다.' })
  @ApiForbiddenResponse({ description: '권한이 없습니다.' })
  @ApiInternalServerErrorResponse({ description: '서버 오류 발생' })
  //@UseGuards(SessionAuthGuard(USER_STATUS.SELECTING_SEAT))
  @Get('seat/:placeId')
  async getSeats(
    @Param('placeId', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE })) placeId: number,
  ) {
    return await this.placeService.getSeats(placeId);
  }

  @Post()
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({ summary: '장소 추가[관리자]', description: '새로운 장소를 추가한다.' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '장소 이름', example: '대극장' },
        address: { type: 'string', description: '장소 주소', example: '서울특별시' },
        overviewSvg: { type: 'string', description: 'overview SVG URL', example: '/overview.svg' },
        overviewHeight: { type: 'number', description: '오버뷰 높이', example: 1000 },
        overviewWidth: { type: 'number', description: '오버뷰 너비', example: 1500 },
        overviewPoints: {
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
    return await this.placeService.createPlace(placeCreationDto);
  }

  @Delete(':placeId')
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({ summary: '장소 삭제[관리자]', description: 'placeId에 해당하는 장소를 삭제한다' })
  @ApiParam({ name: 'placeId', description: '장소 아이디', type: Number, example: 1 })
  @ApiOkResponse({ description: '장소 삭제 성공' })
  @ApiBadRequestResponse({ description: '요청 데이터 누락, 타입 오류', type: Error })
  @ApiUnauthorizedResponse({ description: '관리자 권한 필요', type: Error })
  @ApiForbiddenResponse({ description: '인증되지 않은 요청', type: Error })
  @ApiNotFoundResponse({ description: '장소가 존재하지 않음', type: Error })
  @ApiInternalServerErrorResponse({ description: '서버 내부 에러', type: Error })
  async deletePlace(@Param() placeIdDto: PlaceIdDto) {
    await this.placeService.deletePlace(placeIdDto);
  }

  @Post('section')
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({ summary: '섹션 추가[관리자]', description: '특정 장소에 섹션들을 추가한다' })
  @ApiBody({
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '섹션 이름', example: 's1' },
          colLen: { type: 'integer', description: '섹션의 열 길이', example: 2 },
          seats: {
            type: 'array',
            description: '자리 존재 여부를 나타내는 값',
            items: { type: 'boolean' },
            example: [true, true],
          },
          placeId: { type: 'integer', description: 'place 장소 아이디', example: 1 },
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
    const placeId = this.validatePlaceId(sectinoCreationDtoList);
    await this.placeService.createSections(sectinoCreationDtoList, placeId);
  }

  private validatePlaceId(sectionCreationDtoList: SectionCreationDto[]): number {
    const placeId = sectionCreationDtoList[0].placeId;
    if (sectionCreationDtoList.filter((sectionDto) => sectionDto.placeId !== placeId).length) {
      throw new AppException(PlaceErrorCode.SECTION_PLACE_MISMATCH);
    }
    return placeId;
  }
}
