import { Outlet } from 'react-router-dom';

import Navbar from '@/components/common/Navbar';

export default function Layout() {
  return (
    <>
      <Navbar />
      <Outlet />
    </>
  );
}
