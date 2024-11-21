import { ApiProperty } from '@nestjs/swagger';
import { IsNumber } from 'class-validator';

export class ReservationSeatInfoDto {
  @ApiProperty({
    description: '섹션 인덱스',
    name: 'sectionIndex',
    type: 'number',
    example: 2,
  })
  @IsNumber()
  sectionIndex: number;

  @ApiProperty({
    description: '좌석의 행 번호',
    name: 'row',
    type: 'number',
    example: 5,
  })
  @IsNumber()
  row: number;

  @ApiProperty({
    description: '좌석의 열 번호',
    name: 'col',
    type: 'number',
    example: 8,
  })
  @IsNumber()
  col: number;
}
