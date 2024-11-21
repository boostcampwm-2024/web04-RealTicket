import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

import { ReservationSeatInfoDto } from './reservationSeatInfoDto';

export class ReservationCreateDto {
  @ApiProperty({
    description: '예약할 이벤트 ID',
    name: 'eventId',
    type: 'number',
    example: 123,
  })
  @IsInt()
  eventId: number;

  @ApiProperty({
    description: '예약할 좌석 정보 배열',
    name: 'seats',
    type: [ReservationSeatInfoDto],
    example: [
      { sectionIndex: 2, row: 5, col: 8 },
      { sectionIndex: 2, row: 5, col: 9 },
    ],
  })
  seats: ReservationSeatInfoDto[];
}
