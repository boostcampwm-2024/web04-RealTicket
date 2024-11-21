import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UserLoginDto {
  @ApiProperty({
    description: '사용자의 로그인 ID',
    name: 'loginId',
    type: 'string',
    example: 'user1234',
    minLength: 4,
    maxLength: 12,
    pattern: '^[a-z0-9]+$',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^[a-z0-9]+$/)
  readonly loginId: string;

  @ApiProperty({
    description: '사용자의 로그인 비밀번호',
    name: 'loginPassword',
    type: 'string',
    example: 'pass1234',
    minLength: 4,
    maxLength: 12,
    pattern: '^[a-z0-9]+$',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  @Matches(/^[a-z0-9]+$/)
  readonly loginPassword: string;
}
