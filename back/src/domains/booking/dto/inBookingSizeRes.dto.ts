import { ApiProperty } from '@nestjs/swagger';

export class InBookingSizeResDto {
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  @ApiProperty({
    name: 'maxSize',
    type: Number,
    example: 100,
  })
  maxSize: number;
}
