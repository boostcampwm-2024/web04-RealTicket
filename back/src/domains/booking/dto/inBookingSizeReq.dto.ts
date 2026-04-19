import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class InBookingSizeReqDto {
  @ApiProperty({
    name: 'maxSize',
    type: Number,
    example: 100,
    description: '설정할 크기',
  })
  @IsInt()
  @Min(0)
  maxSize: number;
}
