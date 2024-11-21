import { ApiProperty } from '@nestjs/swagger';

export class layoutDto {
  @ApiProperty({
    description: '레이아웃 이미지 url',
    name: 'overview',
    type: 'string',
    example: 'overview/jpg',
  })
  overview: string;

  overviewWidth: number;
  overviewHeight: number;
  overviewPoints: string;

  @ApiProperty({
    description: '레이아웃의 섹션 배열',
    name: 'sections',
    type: 'array',
    items: {
      type: 'object',
    },
    example: [
      {
        id: 1,
        name: 'A구역',
        seats: [true, false, true, false, true],
        colLen: 5,
      },
    ],
  })
  sections: any[];
}
