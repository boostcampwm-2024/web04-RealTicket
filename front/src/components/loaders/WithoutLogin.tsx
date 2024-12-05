import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuthContext } from '@/hooks/useAuthContext.tsx';

import { ROUTE_URL } from '@/constants/index.ts';

export default function WithoutLogin({ children }: PropsWithChildren) {
  const { isLogin } = useAuthContext();
  if (isLogin) {
    return <Navigate to={ROUTE_URL.PROGRAM.DEFAULT} />;
  }
  return <>{children}</>;
}
