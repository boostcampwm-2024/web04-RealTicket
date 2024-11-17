import { IsString } from 'class-validator';

export class UserLoginIdCheckDto {
  @IsString()
  loginId;
}
