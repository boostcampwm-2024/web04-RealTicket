import { IsString } from 'class-validator';

export class UserLoginDto {
  @IsString()
  readonly loginId: string;

  @IsString()
  //@Matches(/^[A-Za-z\d!@#$%^&*()]{8,12}/)
  readonly loginPassword: string;
}
