import { Navigate, createBrowserRouter } from 'react-router-dom';

import WithLogin from '@/components/loaders/WithLogin';
import WithoutLogin from '@/components/loaders/WithoutLogin';

import AdminPage from '@/pages/AdminPage';
import LoginPage from '@/pages/LoginPage';
import NotFondPage from '@/pages/NotFoundPage.tsx';
import ProgramDetailPage from '@/pages/ProgramDetailPage';
import ProgramsPage from '@/pages/ProgramsPage';
import ReservationPage from '@/pages/ReservationPage';
import ReservationWaitingPage from '@/pages/ReservationWaitingPage';
import SignUpPage from '@/pages/SignupPage';
import WaitingQueuePage from '@/pages/WaitingQueuePage/index.tsx';

import { ROUTE_URL } from '@/constants/index.ts';
import Layout from '@/layout/Layout';

//TODO lazyloading,suspene, fallback 적용, withLogin hoc접근 권한 설정, flat보다는 next 처럼 밑으로 최적화도 더 좋다
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <NotFondPage />,
    children: [
      { path: '*', element: <NotFondPage /> },
      { path: '', element: <Navigate to={ROUTE_URL.PROGRAM.DEFAULT} /> },

      { path: ROUTE_URL.PROGRAM.DEFAULT, element: <ProgramsPage /> },
      { path: `${ROUTE_URL.PROGRAM.DEFAULT}/:programId`, element: <ProgramDetailPage /> },
      {
        path: ROUTE_URL.USER.LOGIN,
        element: (
          <WithoutLogin>
            <LoginPage />
          </WithoutLogin>
        ),
      },

      {
        path: ROUTE_URL.USER.SIGN_UP,
        element: (
          <WithoutLogin>
            <SignUpPage />
          </WithoutLogin>
        ),
      },
      {
        path: '/admin',
        element: (
          <WithLogin>
            <AdminPage />
          </WithLogin>
        ),
      },
      {
        path: `${ROUTE_URL.EVENT.DEFAULT}/:eventId/ready`,
        element: (
          <WithLogin>
            <ReservationWaitingPage />
          </WithLogin>
        ),
      },
      {
        path: `${ROUTE_URL.EVENT.DEFAULT}/:eventId`,
        element: (
          <WithLogin>
            <ReservationPage />
          </WithLogin>
        ),
      },
      {
        path: `${ROUTE_URL.EVENT.DEFAULT}/:eventId/waiting`,
        element: (
          <WithLogin>
            <WaitingQueuePage />
          </WithLogin>
        ),
      },
    ],
  },
]);

export default router;
