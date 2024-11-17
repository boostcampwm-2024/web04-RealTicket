import { ReactNode } from 'react';

import { useAuthReducer } from '@/hooks/useAuthReducer';

import { AuthContext } from '@/contexts/AuthContext';

interface IAuthProviderProps {
  children: ReactNode;
}

//TODO 로그인 여부 cookie 로 확인, Reduce 분리
export default function AuthProvider({ children }: IAuthProviderProps) {
  const { isSignIn, dispatch } = useAuthReducer();
  return <AuthContext.Provider value={{ isSignIn, dispatch }}>{children}</AuthContext.Provider>;
}
