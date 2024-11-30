import { RouterProvider } from 'react-router-dom';

import ToastContainer from '@/components/Toast/ToastContainer.tsx';

import AuthProvider from '@/providers/AuthProvider';
import QueryProvider from '@/providers/QueryProvider';
import router from '@/routes/index';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <RouterProvider router={router} />
        <ToastContainer />
        <ReactQueryDevtools />
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
