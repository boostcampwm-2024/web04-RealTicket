export class UserParamDto {
  constructor({ id, loginId, loginPassword }) {
    this.id = id;
    this.loginId = loginId;
    this.loginPassword = loginPassword;
  }

  id: number;
  loginId: string;
  loginPassword: string;
}
