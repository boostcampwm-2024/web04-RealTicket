import { useContext } from 'react';

import { FieldContext } from '@/contexts/fieldContext';

export const useFieldContext = () => useContext(FieldContext);
