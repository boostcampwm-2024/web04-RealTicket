import { Expose } from 'class-transformer';

export class UserInfoDto {
  @Expose({ name: 'login_id' })
  loginId: string;
}
