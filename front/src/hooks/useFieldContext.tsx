import { useContext } from 'react';

import { FieldContext } from '@/contexts/FieldContext';

export const useFieldContext = () => useContext(FieldContext);
