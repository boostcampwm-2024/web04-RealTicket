import { ReactNode, useState } from 'react';

import { AuthContext } from '@/contexts/AuthContext';

interface IAuthProviderProps {
  children: ReactNode;
}
interface IAuthState {
  isSignIn: boolean;
  userId: string | null;
}

const AUTH_DEFAULT_STATE: IAuthState = {
  isSignIn: false,
  userId: null,
};

//TODO 로그인 여부 cookie 로 확인,
export default function AuthProvider({ children }: IAuthProviderProps) {
  const [auth, setAuth] = useState<IAuthState>(AUTH_DEFAULT_STATE);
  const signIn = (userId: string) => {
    setAuth({ isSignIn: true, userId });
  };
  const logout = () => {
    setAuth({ isSignIn: false, userId: null });
  };

  return (
    <AuthContext.Provider value={{ isSignIn: auth.isSignIn, userId: auth.userId, logout, signIn }}>
      {children}
    </AuthContext.Provider>
  );
}
