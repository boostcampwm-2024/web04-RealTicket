import { ApiProperty } from '@nestjs/swagger';

export class InBookingSizeReqDto {
  @ApiProperty({
    name: 'maxSize',
    type: Number,
    example: 100,
    description: '설정할 크기',
  })
  maxSize: number;
}
