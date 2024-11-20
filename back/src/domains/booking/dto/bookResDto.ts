import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString } from 'class-validator';

import { SeatStatus } from '../const/seatStatus.enum';

export class BookResDto {
  constructor(params: { eventId: number; sectionIndex: number; seatIndex: number; acceptedStatus: string }) {
    Object.assign(this, params);
  }

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
    name: 'accepted-status',
    enum: SeatStatus,
    example: SeatStatus.RESERVE,
    description: '결과 상태(reserved 또는 deleted)',
  })
  acceptedStatus: string;
}
