import { Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <>
      <div>navbar</div>
      <Outlet />
    </>
  );
}
