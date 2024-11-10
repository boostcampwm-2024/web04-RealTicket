import { RouterProvider } from 'react-router-dom';

import router from '@/routes/index.tsx';

function App() {
  return <RouterProvider router={router} />;
}

export default App;
