import { createContext } from 'react';

import type { AuthDispatch } from '@/hooks/useAuthReducer';

export interface IAuthContextValue {
  isSignIn: boolean;
  dispatch: AuthDispatch | null;
}

const AUTH_CONTEXT_DEFAULT_VALUE: IAuthContextValue = {
  isSignIn: false,
  dispatch: null,
};
export const AuthContext = createContext(AUTH_CONTEXT_DEFAULT_VALUE);
