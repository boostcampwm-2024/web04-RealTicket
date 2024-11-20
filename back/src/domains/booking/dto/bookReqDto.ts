import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString } from 'class-validator';

import { SeatStatus } from '../const/seatStatus.enum';

export class BookReqDto {
  @IsNumber()
  @ApiProperty({ name: 'event-id', example: 123 })
  eventId: number;

  @IsNumber()
  @ApiProperty({ name: 'section-index', example: 4 })
  sectionIndex: number;

  @IsNumber()
  @ApiProperty({ name: 'seat-index', example: 56 })
  seatIndex: number;

  @IsString()
  @IsEnum(SeatStatus)
  @ApiProperty({
    name: 'expected-status',
    enum: SeatStatus,
    example: SeatStatus.RESERVE,
    description: '요청 종류(예약 또는 삭제)(reserve 또는 delete)',
  })
  expectedStatus: string;
}
