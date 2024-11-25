import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import Navbar from '@/components/Navbar/index.tsx';

import LoadingPage from '@/pages/LoadingPage';

export default function Layout() {
  return (
    <>
      <Navbar />
      <div className="mx-auto my-4 flex h-[calc(100vh-72px)] max-w-[1080px] items-center justify-center">
        <Suspense fallback={<LoadingPage />}>
          <Outlet />
        </Suspense>
      </div>
    </>
  );
}
