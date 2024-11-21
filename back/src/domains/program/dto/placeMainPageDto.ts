import { ApiProperty } from '@nestjs/swagger';

export class PlaceMainPageDto {
  constructor({ id, name }) {
    this.id = id;
    this.name = name;
  }

  @ApiProperty({
    description: '장소 ID',
    name: 'id',
    type: 'number',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: '장소 이름',
    name: 'name',
    type: 'string',
    example: '세종문화회관',
  })
  name: string;
}
