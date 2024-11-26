import { ApiProperty } from '@nestjs/swagger';

import { PlaceMainPageDto } from './placeMainPage.dto';

export class ProgramMainPageDto {
  constructor({ id, name, genre, place, profileUrl, actors }) {
    this.id = id;
    this.name = name;
    this.genre = genre;
    this.place = new PlaceMainPageDto(place);
    this.profileUrl = profileUrl;
    this.actors = actors;
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
    example: '뮤지컬 레미제라블',
  })
  name: string;

  @ApiProperty({
    description: '프로그램 장르',
    name: 'genre',
    type: 'string',
    example: '뮤지컬',
  })
  genre: string;

  @ApiProperty({
    description: '프로그램 장소 정보',
    name: 'place',
    type: PlaceMainPageDto,
    example: {
      id: 1,
      name: '예술의 전당',
    },
  })
  place: PlaceMainPageDto;

  @ApiProperty({
    description: '프로그램 프로필 이미지 URL',
    name: 'profileUrl',
    type: 'string',
    example: 'https://example.com/profile.jpg',
  })
  profileUrl: string;

  @ApiProperty({
    description: '출연 배우 리스트',
    name: 'actors',
    type: 'string',
    example: '홍길동, 김철수, 이영희',
  })
  actors: string;
}
