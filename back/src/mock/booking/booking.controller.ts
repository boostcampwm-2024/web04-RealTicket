import { Controller } from '@nestjs/common';

import { BookingService } from './booking.service';

@Controller('mock/booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}
}
