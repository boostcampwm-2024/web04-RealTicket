import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsDate, IsNumber, IsString } from 'class-validator';

export class ReservationResultDto {
  @ApiProperty({
    description: '예약된 프로그램 이름',
    name: 'programName',
    type: 'string',
    example: '오페라의 유령',
  })
  @IsString()
  programName: string;

  @ApiProperty({
    description: '프로그램 실행 날짜 및 시간',
    name: 'runningDate',
    type: 'string',
    format: 'date-time',
    example: '2024-12-01T19:30:00Z',
  })
  @IsDate()
  runningDate: Date;

  @ApiProperty({
    description: '예약된 프로그램 장소 이름',
    name: 'place',
    type: 'string',
    example: '서울예술의전당',
  })
  @IsString()
  @Expose({ name: 'place' })
  placeName: string;

  @ApiProperty({
    description: '예약된 좌석 정보 배열',
    name: 'reservedSeats',
    type: 'array',
    items: { type: 'string' },
    example: ['A구역 1행 1열', 'A구역 2행 2열'],
  })
  @IsString({ each: true })
  @Expose({ name: 'reservedSeats' })
  seats: string[];

  @ApiProperty({
    description: '예약 1매당 가격',
    name: 'price',
    type: 'number',
    example: 15000,
  })
  @IsNumber()
  price: number;
}
