import { Controller, Get, HttpStatus, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';

import { SessionAuthGuard } from '../../auth/guard/session.guard';

import { BookingService } from './booking.service';

@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @UseGuards(SessionAuthGuard())
  @Get('permission/:event_id')
  async requestAdmission(
    @Param('event_id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE })) eventId: number,
    @Req() req: Request,
  ) {
    const sid = req.cookies['SID'];
    return await this.bookingService.isAdmission(eventId, sid);
  }
}
