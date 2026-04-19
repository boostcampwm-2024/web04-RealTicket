import { ApiProperty } from '@nestjs/swagger';

export class ErrorDetailDto {
  @ApiProperty({ example: 'AUTH_UNAUTHORIZED' })
  code: string;

  @ApiProperty({ example: '인증된 사용자만 접근 가능합니다.' })
  message: string;
}

export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success: boolean;

  @ApiProperty({ type: ErrorDetailDto })
  error: ErrorDetailDto;
}
