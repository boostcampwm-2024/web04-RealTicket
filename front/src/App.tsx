import { RouterProvider } from 'react-router-dom';

import ConfirmContainer from '@/components/Confirm/ConfirmContainer.tsx';
import ToastContainer from '@/components/Toast/ToastContainer.tsx';

import AuthProvider from '@/providers/AuthProvider';
import ConfirmProvider from '@/providers/ConfirmProvider.tsx';
import QueryProvider from '@/providers/QueryProvider';
import router from '@/routes/index';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

function App() {
  return (
    <QueryProvider>
      <AuthProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
          <ToastContainer />
          <ConfirmContainer />
        </ConfirmProvider>
        <ReactQueryDevtools />
      </AuthProvider>
    </QueryProvider>
  );
}

export default App;
