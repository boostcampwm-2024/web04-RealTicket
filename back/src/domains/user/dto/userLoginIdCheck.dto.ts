import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UserLoginIdCheckDto {
  @ApiProperty({
    description: '사용자의 로그인 ID',
    name: 'loginId',
    type: 'string',
    example: 'user1234',
  })
  @IsString()
  loginId: string;
}
