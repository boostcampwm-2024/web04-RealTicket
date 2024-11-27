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

import Layout from '@/layout/Layout';

//TODO lazyloading,suspene, fallback 적용, withLogin hoc접근 권한 설정, flat보다는 next 처럼 밑으로 최적화도 더 좋다
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <NotFondPage />,
    children: [
      { path: '*', element: <NotFondPage /> },
      { path: '', element: <Navigate to="/programs" /> },

      { path: '/programs', element: <ProgramsPage /> },
      { path: '/programs/:programId', element: <ProgramDetailPage /> },
      {
        path: '/login',
        element: (
          <WithoutLogin>
            <LoginPage />
          </WithoutLogin>
        ),
      },

      {
        path: '/signUp',
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
        path: '/events/:eventId/waiting',
        element: (
          <WithLogin>
            <ReservationWaitingPage />
          </WithLogin>
        ),
      },
      {
        path: '/events/:eventId',
        element: (
          <WithLogin>
            <ReservationPage />
          </WithLogin>
        ),
      },
      {
        path: '/waiting/:eventId/',
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
