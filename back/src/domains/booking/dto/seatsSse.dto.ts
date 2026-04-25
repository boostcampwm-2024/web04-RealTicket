import { ApiProperty } from '@nestjs/swagger';

export class SeatsSseDto {
  constructor(sectionIndex: number, seatStatus: number[]) {
    this.sectionIndex = sectionIndex;
    this.seatStatus = seatStatus;
  }

  @ApiProperty({
    name: 'sectionIndex',
    example: 0,
    description: '브로드캐스트 대상 섹션 인덱스',
  })
  sectionIndex: number;

  @ApiProperty({
    name: 'seatStatus',
    example: [1, 1, 0, 1],
    description: '해당 섹션의 좌석 상태 배열. 1은 예약 가능, 0은 예약 불가.',
  })
  seatStatus: number[];
}
