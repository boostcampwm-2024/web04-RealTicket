import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuthContext } from '@/hooks/useAuthContext.tsx';

import { toast } from '@/components/Toast/index.ts';

import { ROUTE_URL } from '@/constants/index.ts';

export default function WithoutLogin({ children }: PropsWithChildren) {
  const { isLogin } = useAuthContext();
  if (isLogin) {
    toast.warning('로그인 후 접근할 수 없습니다.\n로그 아웃 후 이용해주세요.');
    return <Navigate to={ROUTE_URL.PROGRAM.DEFAULT} />;
  }
  return <>{children}</>;
}
