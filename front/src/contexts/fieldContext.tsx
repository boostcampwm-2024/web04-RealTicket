import { createContext, useContext } from 'react';

interface IFieldContextValue {
  isValid: boolean;
  htmlFor: null | string;
}
const FIELD_CONTEXT_DEFAULT_VALUE: IFieldContextValue = {
  isValid: true,
  htmlFor: null,
};
export const fieldContext = createContext(FIELD_CONTEXT_DEFAULT_VALUE);
export const useFieldContext = () => useContext(fieldContext);
