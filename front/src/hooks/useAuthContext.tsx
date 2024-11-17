import { useContext } from 'react';

import { AuthContext } from '@/contexts/AuthContext';

export const useAuthContext = () => useContext(AuthContext);
