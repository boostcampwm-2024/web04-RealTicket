import { Controller, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';

import { BookingService } from './booking.service';

@Controller('mock/booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Sse('re-permission/:eventId')
  rePermission(@Param('eventId') eventId: number): Observable<MessageEvent> {
    return this.bookingService.rePermission(eventId);
  }
}
