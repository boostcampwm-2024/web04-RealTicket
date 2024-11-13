import { Navigate, createBrowserRouter } from 'react-router-dom';

import Layout from '@/layout/Layout';
import DetailPage from '@/pages/DetailPage';
import MainPage from '@/pages/MainPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <div>notFound</div>,
    children: [
      { path: '', element: <Navigate to="programs" /> },
      { path: '/programs', element: <MainPage></MainPage> },
      { path: '/programs/:programId', element: <DetailPage></DetailPage> },
    ],
  },
]);

export default router;
