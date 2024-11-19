import { Outlet } from 'react-router-dom';

import Navbar from '@/components/common/Navbar';

export default function Layout() {
  return (
    <>
      <Navbar />
      <div className="mx-auto my-4 flex max-w-[1080px] items-center justify-center">
        <Outlet />
      </div>
    </>
  );
}
