import { Outlet } from 'react-router-dom';

import Navbar from '@/components/common/Navbar';

export default function Layout() {
  return (
    <>
      <Navbar />
      <div className="mx-auto flex h-[calc(100vh-72px)] max-w-[1010px] items-center">
        <Outlet />
      </div>
    </>
  );
}
