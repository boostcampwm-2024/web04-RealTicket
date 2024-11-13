import { Navigate, createBrowserRouter } from 'react-router-dom';

import EventDetailPage from '@/pages/EventDetailPage';
import MainPage from '@/pages/MainPage';
import ProgramDetailPage from '@/pages/ProgramDetailPage';

import Layout from '@/layout/Layout';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <div>notFound</div>,
    children: [
      { path: '', element: <Navigate to="programs" /> },
      { path: '/programs', element: <MainPage /> },
      { path: '/programs/:programId', element: <ProgramDetailPage /> },
      { path: 'event/:eventId/', element: <EventDetailPage /> },
    ],
  },
]);

export default router;
