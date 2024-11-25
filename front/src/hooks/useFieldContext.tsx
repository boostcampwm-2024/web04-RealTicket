import { useContext } from 'react';

import { FieldContext } from '@/contexts/FieldContext.tsx';

export const useFieldContext = () => useContext(FieldContext);
