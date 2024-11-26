import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

import { MAX_BOOKING_AMOUNT, MIN_BOOKING_AMOUNT } from '../const/bookingAmount.const';

export class BookingAmountReqDto {
  @ApiProperty({
    description: '예매 수량',
    name: 'bookingAmount',
    type: Number,
    minimum: MIN_BOOKING_AMOUNT,
    maximum: MAX_BOOKING_AMOUNT,
    example: 1,
  })
  @IsNumber()
  @Min(MIN_BOOKING_AMOUNT)
  @Max(MAX_BOOKING_AMOUNT)
  bookingAmount: number;
}
