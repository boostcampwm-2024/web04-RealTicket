export class UserParamDto {
  constructor({ id, loginId }) {
    this.id = id;
    this.loginId = loginId;
  }

  id: number;
  loginId: string;
}
