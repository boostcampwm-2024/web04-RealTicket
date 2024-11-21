import { ApiProperty } from '@nestjs/swagger';

export class ServerTimeDto {
  @ApiProperty({
    description: '현재 서버 시간 ( 밀리초 단위)',
    name: 'now',
    type: 'number',
    example: 1700000000000,
  })
  now: number;
}
