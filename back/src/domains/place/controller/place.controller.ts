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
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';

import { USER_STATUS } from 'src/auth/const/userStatus.const';
import { SessionAuthGuard } from 'src/auth/guard/session.guard';
import { AppException } from 'src/common/exception/app.exception';
import { ErrorResponseDto } from 'src/common/dto/error-response.dto';
import { SuccessResponseDto } from 'src/common/dto/success-response.dto';
import { CommonErrorCode } from 'src/domains/user/exception/user-error-code';

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
  @ApiExtraModels(SuccessResponseDto, SeatInfoDto)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { $ref: getSchemaPath(SeatInfoDto) } } },
      ],
    },
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'PLACE_NOT_FOUND' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
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
  @ApiBody({ type: PlaceCreationDto })
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
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  async createPlace(@Body() placeCreationDto: PlaceCreationDto) {
    return await this.placeService.createPlace(placeCreationDto);
  }

  @Delete(':placeId')
  @UseGuards(SessionAuthGuard(USER_STATUS.ADMIN))
  @ApiOperation({ summary: '장소 삭제[관리자]', description: 'placeId에 해당하는 장소를 삭제한다' })
  @ApiParam({ name: 'placeId', description: '장소 아이디', type: Number, example: 1 })
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
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'PLACE_NOT_FOUND' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
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
  @ApiCreatedResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(SuccessResponseDto) },
        { properties: { data: { type: 'object', nullable: true } } },
      ],
    },
  })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'SECTION_PLACE_MISMATCH | COMMON_INVALID_INPUT' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'AUTH_UNAUTHORIZED' })
  @ApiForbiddenResponse({ type: ErrorResponseDto, description: 'AUTH_FORBIDDEN' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'PLACE_NOT_FOUND' })
  @ApiInternalServerErrorResponse({ type: ErrorResponseDto, description: 'COMMON_UNKNOWN_ERROR' })
  async createSection(@Body() sectinoCreationDtoList: SectionCreationDto[]) {
    const placeId = this.validatePlaceId(sectinoCreationDtoList);
    await this.placeService.createSections(sectinoCreationDtoList, placeId);
  }

  private validatePlaceId(sectionCreationDtoList: SectionCreationDto[]): number {
    if (!sectionCreationDtoList.length) {
      throw new AppException(CommonErrorCode.VALIDATION_ERROR);
    }
    const placeId = sectionCreationDtoList[0].placeId;
    if (sectionCreationDtoList.filter((sectionDto) => sectionDto.placeId !== placeId).length) {
      throw new AppException(PlaceErrorCode.SECTION_PLACE_MISMATCH);
    }
    return placeId;
  }
}
