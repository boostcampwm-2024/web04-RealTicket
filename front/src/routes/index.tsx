import { Navigate, createBrowserRouter } from 'react-router-dom';

import AdminPage from '@/pages/AdminPage';
import ProgramDetailPage from '@/pages/ProgramDetailPage';
import ProgramsPage from '@/pages/ProgramsPage';
import ReservationWaitingPage from '@/pages/ReservationWaitingPage';
import SeatPage from '@/pages/SeatPage';
import SignInPage from '@/pages/SignInPage';
import SignUpPage from '@/pages/SignUpPage';

import Layout from '@/layout/Layout';

//TODO lazyloading,suspene, fallback 적용, withLogin hoc접근 권한 설정,
const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <div>notFound</div>,
    children: [
      { path: '', element: <Navigate to="programs" /> },
      { path: '/programs', element: <ProgramsPage /> },
      { path: '/programs/:programId', element: <ProgramDetailPage /> },
      { path: '/signIn', element: <SignInPage /> },
      { path: '/signUp', element: <SignUpPage /> },
      { path: '/admin', element: <AdminPage /> },
      { path: '/events/:eventId/waiting', element: <ReservationWaitingPage /> },
      { path: '/events/:eventId', element: <SeatPage /> },
    ],
  },
]);

export default router;
