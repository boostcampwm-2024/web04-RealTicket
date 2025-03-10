import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Request } from 'express';

import { USER_STATUS } from '../../auth/const/userStatus.const';
import { SessionAuthGuard } from '../../auth/guard/session.guard';
import { BookingService } from '../../domains/booking/service/booking.service';
import { SeatsBenchmarkService } from '../service/seats-benchmark.service';

@Controller('benchmark')
export class BenchmarkController {
  constructor(
    private readonly SeatsBenchmarkService: SeatsBenchmarkService,
    private readonly bookingService: BookingService,
  ) {}

  @Get('seat/:eventId')
  @UseGuards(SessionAuthGuard([USER_STATUS.ENTERING, USER_STATUS.SELECTING_SEAT]))
  @ApiOperation({
    summary: '(벤치마크용)실시간 좌석 현황 조회 with HTTP Polling',
    description: '실시간으로 좌석 예약 현황을 조회한다.',
  })
  @ApiUnauthorizedResponse({ description: '인증 실패' })
  async getSeatStatusByEventId(@Param('eventId') eventId: number, @Req() req: Request) {
    const sid = req.cookies['SID'];
    await this.bookingService.setInBookingFromEntering(sid);

    return await this.SeatsBenchmarkService.getSeatsStatusByEventId(eventId);
  }
}
