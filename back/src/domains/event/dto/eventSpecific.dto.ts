import { ApiProperty } from '@nestjs/swagger';

import { placeSpecificEventDto } from './placeSpecificEvent.dto';

export class EventSpecificDto {
  constructor({
    id,
    name,
    place,
    price,
    runningTime,
    runningDate,
    reservationOpenDate,
    reservationCloseDate,
  }) {
    this.id = id;
    this.name = name;
    this.place = new placeSpecificEventDto(place);
    this.price = price;
    this.runningTime = runningTime;
    this.runningDate = runningDate;
    this.reservationOpenDate = reservationOpenDate;
    this.reservationCloseDate = reservationCloseDate;
  }

  @ApiProperty({
    description: '이벤트 ID',
    name: 'id',
    type: 'number',
    example: 101,
  })
  id: number;

  @ApiProperty({
    description: '이벤트 이름',
    name: 'name',
    type: 'string',
    example: '오페라의 유령',
  })
  name: string;

  @ApiProperty({
    description: '이벤트 장소 정보',
    name: 'place',
    type: placeSpecificEventDto,
    example: {
      id: 1,
      name: '서울예술의전당',
    },
  })
  place: placeSpecificEventDto;

  @ApiProperty({
    description: '이벤트 가격',
    name: 'price',
    type: 'number',
    example: 15000,
  })
  price: number;

  @ApiProperty({
    description: '이벤트 러닝타임(초단위)',
    name: 'runningTime',
    type: 'number',
    example: 120000,
  })
  runningTime: number;

  @ApiProperty({
    description: '이벤트 실행 날짜 및 시간',
    name: 'runningDate',
    type: 'string',
    format: 'date-time',
    example: '2024-12-01T19:30:00Z',
  })
  runningDate: Date;

  @ApiProperty({
    description: '예약 시작 날짜 및 시간',
    name: 'reservationOpenDate',
    type: 'string',
    format: 'date-time',
    example: '2024-11-01T09:00:00Z',
  })
  reservationOpenDate: Date;

  @ApiProperty({
    description: '예약 종료 날짜 및 시간',
    name: 'reservationCloseDate',
    type: 'string',
    format: 'date-time',
    example: '2024-11-30T23:59:59Z',
  })
  reservationCloseDate: Date;
}
