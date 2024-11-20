import { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';

import LoadingPage from '@/pages/Loading.tsx';

import AuthProvider from '@/providers/AuthProvider';
import QueryProvider from '@/providers/QueryProvider';
import router from '@/routes/index';

function App() {
  return (
    <AuthProvider>
      <QueryProvider>
        <Suspense fallback={<LoadingPage />}>
          <RouterProvider router={router} />
        </Suspense>
      </QueryProvider>
    </AuthProvider>
  );
}

export default App;
