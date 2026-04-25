import { ApiProperty } from '@nestjs/swagger';

export class SectionSwitchResDto {
  constructor(data: { sectionIndex: number; seatStatus: number[] }) {
    this.sectionIndex = data.sectionIndex;
    this.seatStatus = data.seatStatus;
  }

  @ApiProperty({ name: 'sectionIndex', example: 1, description: '전환된 섹션 인덱스' })
  sectionIndex: number;

  @ApiProperty({
    name: 'seatStatus',
    example: [1, 0, 1],
    description: '해당 섹션의 현재 좌석 상태 배열 (1=예약됨, 0=빈 좌석)',
    type: [Number],
  })
  seatStatus: number[];
}
