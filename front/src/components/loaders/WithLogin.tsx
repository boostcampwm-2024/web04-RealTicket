import type { PropsWithChildren } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuthContext } from '@/hooks/useAuthContext.tsx';

import { toast } from '@/components/Toast/index.ts';

import { ROUTE_URL } from '@/constants/index.ts';

//TODO toast 알림 추가 필ㄹ요
export default function WithLogin({ children }: PropsWithChildren) {
  const { isLogin } = useAuthContext();
  if (!isLogin) {
    toast.warning('로그인이 필요한 서비스입니다.\n로그인 후 이용해주세요.');
    return <Navigate to={ROUTE_URL.USER.LOGIN} />;
  }
  return <>{children}</>;
}
