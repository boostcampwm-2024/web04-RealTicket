import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, ArrayNotEmpty, IsArray, IsInt, ValidateNested } from 'class-validator';

import { ReservationSeatInfoDto } from './reservationSeatInfo.dto';

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
      { sectionIndex: 2, seatIndex: 7 },
      { sectionIndex: 2, seatIndex: 8 },
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReservationSeatInfoDto)
  seats: ReservationSeatInfoDto[];
}
