import { ApiProperty } from '@nestjs/swagger';

export class SeatsSseDto {
  constructor(seats: boolean[][]) {
    this.seatStatus = seats;
  }
  @ApiProperty({
    name: 'seatStatus',
    example: [
      [true, true, false],
      [false, true, true, true],
    ],
    description:
      '각 칸마다 true는 예약 가능, false는 예약 불가. 상위 배열은 구역의 배열이며 하위 배열은 구역 내의 좌석 배열임.',
  })
  seatStatus: boolean[][];
}
