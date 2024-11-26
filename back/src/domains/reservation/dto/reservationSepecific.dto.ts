import { ApiProperty } from '@nestjs/swagger';

export class ReservationSpecificDto {
  constructor({ id, programName, runningDate, placeName, seats }) {
    this.id = id;
    this.programName = programName;
    this.runningDate = runningDate;
    this.placeName = placeName;
    this.seats = seats;
  }

  @ApiProperty({
    description: '예약 ID',
    name: 'id',
    type: 'number',
    example: 123,
  })
  id: number;

  @ApiProperty({
    description: '예약된 프로그램 이름',
    name: 'programName',
    type: 'string',
    example: '오페라의 유령',
  })
  programName: string;

  @ApiProperty({
    description: '예약된 프로그램의 실행 날짜 및 시간',
    name: 'runningDate',
    type: 'string',
    format: 'date-time',
    example: '2024-12-01T19:30:00Z',
  })
  runningDate: Date;

  @ApiProperty({
    description: '프로그램이 실행될 장소 이름',
    name: 'placeName',
    type: 'string',
    example: '서울예술의전당',
  })
  placeName: string;

  @ApiProperty({
    description: '예약된 좌석 정보',
    name: 'seats',
    type: 'string',
    example: 'A구역 10번, 11번',
  })
  seats: string;
}
