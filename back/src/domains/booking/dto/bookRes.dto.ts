import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsString } from 'class-validator';

import { SeatStatus } from '../const/seatStatus.enum';

export class BookResDto {
  constructor(params: { eventId: number; sectionIndex: number; seatIndex: number; acceptedStatus: string }) {
    Object.assign(this, params);
  }

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
    name: 'acceptedStatus',
    enum: SeatStatus,
    example: SeatStatus.RESERVE,
    description: '결과 상태(reserved 또는 deleted)',
  })
  acceptedStatus: string;
}
