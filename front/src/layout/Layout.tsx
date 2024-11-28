import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import Navbar from '@/components/Navbar/index.tsx';

import LoadingPage from '@/pages/LoadingPage';

export default function Layout() {
  return (
    <>
      <Navbar />
      <div className="mx-auto flex h-[calc(100vh-72px)] max-w-[1080px] justify-center p-8 pt-4">
        <Suspense fallback={<LoadingPage />}>
          <Outlet />
        </Suspense>
      </div>
    </>
  );
}
