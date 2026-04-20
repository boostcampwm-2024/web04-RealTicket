import { ApiProperty } from '@nestjs/swagger';

export class SuccessResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ description: '응답 데이터' })
  data: T;
}
