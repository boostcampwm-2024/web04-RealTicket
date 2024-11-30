import { useEffect, useState, useTransition } from 'react';

import Toast from '@/components/Toast/Toast.tsx';

import ToastEvent from '@/events/ToastEvent.ts';

export type ToastType = 'success' | 'warning' | 'error';

interface ToastData {
  type: ToastType;
  text: string;
  id: number;
}

export default function ToastContainer() {
  const [toastList, setToastList] = useState<ToastData[]>([]);
  const [, startTransition] = useTransition();
  const getId = () => Date.now();
  const setSuccessToast = (text: string) =>
    startTransition(() => setToastList((prev) => [{ type: 'success', text, id: getId() }, ...prev]));
  const setWarningToast = (text: string) =>
    startTransition(() => setToastList((prev) => [{ type: 'warning', text, id: getId() }, ...prev]));
  const setErrorToast = (text: string) =>
    startTransition(() => setToastList((prev) => [{ type: 'error', text, id: getId() }, ...prev]));

  useEffect(() => {
    const toastEvent = ToastEvent.getInstance();
    toastEvent.on('success', setSuccessToast);
    toastEvent.on('warning', setWarningToast);
    toastEvent.on('error', setErrorToast);

    return () => {
      toastEvent.off('success', setSuccessToast);
      toastEvent.off('warning', setWarningToast);
      toastEvent.off('error', setErrorToast);
    };
  }, []);
  return (
    <div className="fixed left-8 top-20 z-20 flex flex-col gap-5 overflow-visible transition-all">
      {toastList.map((toast) => (
        <Toast
          key={toast.id}
          {...toast}
          close={() => {
            setToastList((prevList) => prevList.filter((prev) => toast.id !== prev.id));
          }}
        />
      ))}
    </div>
  );
}
