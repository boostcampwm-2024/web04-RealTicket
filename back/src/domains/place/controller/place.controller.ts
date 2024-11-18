import { Controller, Get, HttpStatus, Param, ParseIntPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { SeatInfoDto } from '../dto/seatInfo.dto';
import { getSeatResponseExample } from '../example/response/getSeatResponseExample';
import { PlaceService } from '../service/place.service';

@ApiTags('Place')
@Controller('place')
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
}
