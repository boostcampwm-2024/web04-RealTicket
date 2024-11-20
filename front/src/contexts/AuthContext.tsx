import { createContext } from 'react';

export interface IAuthContextValue {
  isSignIn: boolean;
  userId: null | string;
  signIn: ((useId: string) => void) | null;
  logout: (() => void) | null;
}

const AUTH_CONTEXT_DEFAULT_VALUE: IAuthContextValue = {
  isSignIn: false,
  userId: null,
  signIn: null,
  logout: null,
};
export const AuthContext = createContext(AUTH_CONTEXT_DEFAULT_VALUE);
