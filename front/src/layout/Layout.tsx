import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import Navbar from '@/components/common/Navbar';

import LoadingPage from '@/pages/LoadingPage';

export default function Layout() {
  return (
    <>
      <Navbar />
      <Suspense fallback={<LoadingPage />}>
        <div className="mx-auto my-4 flex h-[calc(100vh-72px)] max-w-[1080px] items-center justify-center">
          <Outlet />
        </div>
      </Suspense>
    </>
  );
}
