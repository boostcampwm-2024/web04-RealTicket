import { ApiProperty } from '@nestjs/swagger';

import { layoutDto } from './layout.dto';

export class SeatInfoDto {
  @ApiProperty({
    description: '좌석 ID',
    name: 'id',
    type: 'number',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: '좌석 레이아웃 정보',
    name: 'layout',
    type: layoutDto,
    example: {
      overview: 'overview/jpg',
      sections: [
        {
          id: 1,
          name: 'A',
          seats: [true, false, true, false, true],
          colLen: 5,
        },
        {
          id: 2,
          name: 'B',
          seats: [true, false, true, false, true],
          colLen: 5,
        },
      ],
    },
  })
  layout: layoutDto;
}
