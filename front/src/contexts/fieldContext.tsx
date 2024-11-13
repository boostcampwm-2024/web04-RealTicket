import { createContext, useContext } from 'react';

const FIELD_CONTEXT_DEFAULT_VALUE = {
  isValid: true,
  htmlFor: '',
};
export const fieldContext = createContext(FIELD_CONTEXT_DEFAULT_VALUE);
export const useFieldContext = () => useContext(fieldContext);
