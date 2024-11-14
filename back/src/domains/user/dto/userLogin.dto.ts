import { IsString } from 'class-validator';

export class CreateUserDto {
  @IsString()
  readonly login_id: string;

  @IsString()
  //@Matches(/^[A-Za-z\d!@#$%^&*()]{8,12}/)
  readonly login_password: string;
}
