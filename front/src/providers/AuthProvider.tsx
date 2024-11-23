import { ReactNode, useEffect, useLayoutEffect, useState } from 'react';

import { CustomError } from '@/api/axios.ts';
import { getUser } from '@/api/user.ts';

import LoadingPage from '@/pages/LoadingPage.tsx';

import { AuthContext } from '@/contexts/AuthContext';
import AuthEvent from '@/events/AuthEvent.ts';
import { UserInformation } from '@/type/user.ts';
import { useQuery } from '@tanstack/react-query';

interface IAuthProviderProps {
  children: ReactNode;
}
interface IAuthState {
  isLogin: boolean;
  userId: string | null;
}

const AUTH_DEFAULT_STATE: IAuthState = {
  isLogin: false,
  userId: null,
};

//TODO 로그인 여부 cookie 로 확인,
export default function AuthProvider({ children }: IAuthProviderProps) {
  const [auth, setAuth] = useState<IAuthState>(AUTH_DEFAULT_STATE);
  const { data: userInformation, isPending } = useQuery<UserInformation | null, CustomError>({
    queryKey: [],
    queryFn: getUser,
    retry: false,
  });

  useEffect(() => {
    const authEvent = AuthEvent.getInstance();
    authEvent.on('logout', logout);

    return () => {
      authEvent.off('log', logout);
    };
  }, []);

  useLayoutEffect(() => {
    if (userInformation) {
      const { loginId } = userInformation;
      if (loginId) {
        login(loginId);
      }
    }
  }, [userInformation]);
  const login = (userId: string) => {
    setAuth({ isLogin: true, userId });
  };
  const logout = () => {
    setAuth({ isLogin: false, userId: null });
  };

  //TODO suspense
  if (isPending) return <LoadingPage></LoadingPage>;

  return (
    <AuthContext.Provider value={{ isLogin: auth.isLogin, userId: auth.userId, logout, login }}>
      {children}
    </AuthContext.Provider>
  );
}
