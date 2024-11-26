import { ApiProperty } from '@nestjs/swagger';

import { Event } from 'src/domains/event/entity/event.entity';

import { EventSpecificProgramDto } from './eventSpecificProgram.dto';
import { PlaceSpecificProgramDto } from './placeSpecificProgram.dto';

export class ProgramSpecificDto {
  constructor({ id, name, runningTime, genre, actors, place, profileUrl, price, events }) {
    this.id = id;
    this.name = name;
    this.runningTime = runningTime;
    this.genre = genre;
    this.actors = actors;
    this.place = new PlaceSpecificProgramDto(place);
    this.profileUrl = profileUrl;
    this.price = price;
    this.events = events.reduce((acc: EventSpecificProgramDto[], event: Event) => {
      acc.push(new EventSpecificProgramDto(event));
      return acc;
    }, []);
  }

  @ApiProperty({
    description: '프로그램 ID',
    name: 'id',
    type: 'number',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: '프로그램 이름',
    name: 'name',
    type: 'string',
    example: '오페라의 유령',
  })
  name: string;

  @ApiProperty({
    description: '프로그램 러닝타임(초 단위)',
    name: 'runningTime',
    type: 'number',
    example: 1200000,
  })
  runningTime: number;

  @ApiProperty({
    description: '프로그램 장르',
    name: 'genre',
    type: 'string',
    example: '뮤지컬',
  })
  genre: string;

  @ApiProperty({
    description: '출연 배우 리스트',
    name: 'actors',
    type: 'string',
    example: '곽희상, 김동현, 박노철, 신성규',
  })
  actors: string;

  @ApiProperty({
    description: '프로그램 장소 정보',
    name: 'place',
    type: PlaceSpecificProgramDto,
    example: {
      id: 1,
      name: '서울예술의전당',
    },
  })
  place: PlaceSpecificProgramDto;

  @ApiProperty({
    description: '프로그램 프로필 이미지 URL',
    name: 'profileUrl',
    type: 'string',
    example: 'https://example.com/profile.jpg',
  })
  profileUrl: string;

  @ApiProperty({
    description: '프로그램 가격',
    name: 'price',
    type: 'number',
    example: 50000,
  })
  price: number;

  @ApiProperty({
    description: '프로그램 이벤트 리스트',
    name: 'events',
    type: [EventSpecificProgramDto],
    example: [
      {
        id: 1,
        runningDate: '2024-12-01T15:00:00Z',
      },
      {
        id: 2,
        runningDate: '2024-12-02T15:00:00Z',
      },
    ],
  })
  events: EventSpecificProgramDto[];
}
