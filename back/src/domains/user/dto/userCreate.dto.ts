import { IsString, MaxLength, MinLength } from 'class-validator';

import { NotIn } from '../../../decorator/not-in';

export class UserCreateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(15)
  readonly loginId: string;

  @IsString()
  @NotIn('loginId', { message: '비밀번호는 사용자 아이디를 포함할 수 없습니다.' })
  //@Matches(/^[A-Za-z\d!@#$%^&*()]{8,12}/)
  readonly loginPassword: string;
}
