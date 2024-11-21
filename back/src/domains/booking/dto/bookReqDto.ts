import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString } from 'class-validator';

import { SeatStatus } from '../const/seatStatus.enum';

export class BookReqDto {
  @IsNumber()
  @ApiProperty({ name: 'eventId', example: 123 })
  eventId: number;

  @IsNumber()
  @ApiProperty({ name: 'sectionIndex', example: 4 })
  sectionIndex: number;

  @IsNumber()
  @ApiProperty({ name: 'seatIndex', example: 56 })
  seatIndex: number;

  @IsString()
  @IsEnum(SeatStatus)
  @ApiProperty({
    name: 'expectedStatus',
    enum: SeatStatus,
    example: SeatStatus.RESERVE,
    description: '요청 종류(예약 또는 삭제)(reserve 또는 delete)',
  })
  expectedStatus: string;
}
