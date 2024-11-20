import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Sse,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { Observable } from 'rxjs';

import { USER_STATUS } from '../../../auth/const/userStatus.const';
import { SessionAuthGuard } from '../../../auth/guard/session.guard';
import { BookingAmountReqDto } from '../dto/bookingAmountReqDto';
import { BookingAmountResDto } from '../dto/bookingAmountResDto';
import { BookingSeatsService } from '../service/booking-seats.service';
import { BookingService } from '../service/booking.service';
import { InBookingService } from '../service/in-booking.service';

@Controller('booking')
export class BookingController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly inBookingService: InBookingService,
    private readonly seatsUpdateService: BookingSeatsService,
  ) {}

  @UseGuards(SessionAuthGuard())
  @Get('permission/:event_id')
  async requestAdmission(
    @Param('event_id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE })) eventId: number,
    @Req() req: Request,
  ) {
    const sid = req.cookies['SID'];
    return await this.bookingService.isAdmission(eventId, sid);
  }

  @UseGuards(SessionAuthGuard(USER_STATUS.SELECTING_SEAT))
  @Post('count')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({ summary: '예매 인원 설정', description: '예매할 인원 수를 설정한다.' })
  @ApiBody({ type: BookingAmountReqDto })
  @ApiOkResponse({ description: '인원 설정 성공', type: BookingAmountReqDto })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  @ApiBadRequestResponse({ description: '잘못된 요청' })
  async setBookingAmount(@Req() req: Request, @Body() dto: BookingAmountReqDto) {
    const sid = req.cookies['SID'];
    const result = await this.inBookingService.setBookingAmount(sid, dto.bookingAmount);
    return new BookingAmountResDto(result);
  }

  @Sse('seats/:eventId')
  @UseGuards(SessionAuthGuard(USER_STATUS.SELECTING_SEAT))
  @ApiOperation({
    summary: '실시간 좌석 예약 현황 SSE',
    description: '실시간으로 좌석 예약 현황을 조회한다.',
  })
  @ApiOkResponse({ description: 'SSE 연결 성공' })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  async getReservationStatusByEventId(@Param('eventId') eventId: number): Promise<Observable<MessageEvent>> {
    return this.seatsUpdateService.subscribeSeats(eventId);
  }
}
