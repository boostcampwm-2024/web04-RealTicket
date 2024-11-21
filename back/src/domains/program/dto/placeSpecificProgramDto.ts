import { ApiProperty } from '@nestjs/swagger';

export class PlaceSpecificProgramDto {
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
    example: '서울예술의전당',
  })
  name: string;
}
