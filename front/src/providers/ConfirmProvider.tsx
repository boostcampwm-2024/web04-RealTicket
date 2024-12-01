import { PropsWithChildren, createContext, useState } from 'react';

export const ConfirmContext = createContext<ConfirmContext | null>(null);

interface ButtonContent {
  text: string;
  color: 'success' | 'error' | 'primary';
  handleClick: () => void;
}

interface ConfirmValue {
  title: string;
  description: string;
  ok: ButtonContent;
  cancel: Omit<ButtonContent, 'color'>;
}
interface ConfirmContext {
  confirmValue: ConfirmValue | null;
  setConfirm: (value: ConfirmValue) => void;
  clearConfirm: () => void;
}

export default function ConfirmProvider({ children }: PropsWithChildren) {
  const [confirmValue, setConfirmValue] = useState<ConfirmValue | null>(null);
  const setConfirm = (value: ConfirmValue) => {
    setConfirmValue(value);
  };
  const clearConfirm = () => {
    setConfirmValue(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirmValue, setConfirm, clearConfirm }}>
      {children}
    </ConfirmContext.Provider>
  );
}
