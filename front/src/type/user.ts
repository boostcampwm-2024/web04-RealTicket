export interface UserInformation {
  loginId: string;
}

export type LoginForm = {
  id: string;
  password: string;
};

export type Guest = {
  id: number;
  loginId: string;
  userStatus: string;
  targetEvent: null;
};
