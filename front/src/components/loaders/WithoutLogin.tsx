import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuthContext } from '@/hooks/useAuthContext.tsx';

export default function WithoutLogin({ children }: PropsWithChildren) {
  const { isLogin } = useAuthContext();
  if (isLogin) return <Navigate to={'/'} />;
  return <>{children}</>;
}
