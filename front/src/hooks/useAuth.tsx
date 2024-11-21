import { useState } from 'react';

//TODO 로그인시 userId를 저장해야된다, 아니면
interface IAuthState {
  isSignIn: boolean;
  userId: string | null;
}

const AUTH_DEFAULT_STATE: IAuthState = {
  isSignIn: false,
  userId: null,
};
//TODO useEffect 로그인 여부 확인
export const useAuth = () => {
  const [auth, setAuth] = useState<IAuthState>(AUTH_DEFAULT_STATE);
  const signIn = (userId: string) => {
    setAuth({ isSignIn: true, userId });
  };
  const logout = () => {
    setAuth({ isSignIn: false, userId: null });
  };

  return { isSignIn: auth.isSignIn, userId: auth.userId, signIn, logout };
};
