import { RouterProvider } from 'react-router-dom';

import AuthProvider from '@/providers/AuthProvider.tsx';
import router from '@/routes/index.tsx';

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
