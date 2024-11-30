import { createContext } from 'react';

interface IFieldContextValue {
  isValid: boolean;
  htmlFor: null | string;
}
const FIELD_CONTEXT_DEFAULT_VALUE: IFieldContextValue = {
  isValid: true,
  htmlFor: null,
};
export const FieldContext = createContext(FIELD_CONTEXT_DEFAULT_VALUE);
