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

export class OccupiedSeatsSseDto {
  constructor(occupiedSeats: [number, number][]) {
    this.occupiedSeats = occupiedSeats;
  }

  @ApiProperty({
    name: 'occupiedSeats',
    example: [
      [0, 5],
      [1, 12],
    ],
    description: '점유 좌석 목록 ([sectionIndex, seatIndex][] 형식). SSE 초기/재연결 시에만 포함.',
    required: true,
    isArray: true,
    type: [Number],
  })
  occupiedSeats: [number, number][];
}

export type SeatsSsePayloadDto = SeatsSseDto | OccupiedSeatsSseDto;
