import { createContext } from 'react';

export interface IAuthContextValue {
  isLogin: boolean;
  userId: null | string;
  login: ((useId: string) => void) | null;
  logout: (() => void) | null;
}

const AUTH_CONTEXT_DEFAULT_VALUE: IAuthContextValue = {
  isLogin: false,
  userId: null,
  login: null,
  logout: null,
};
export const AuthContext = createContext(AUTH_CONTEXT_DEFAULT_VALUE);
