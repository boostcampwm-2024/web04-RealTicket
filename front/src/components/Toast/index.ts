import ToastEvent from '@/events/ToastEvent.ts';

const toastEvent = ToastEvent.getInstance();

export { default as ToastContainer } from '@/components/Toast/ToastContainer.tsx';
export const toast = {
  success: (text: string) => {
    toastEvent.emit('success', text);
  },
  error: (text: string) => {
    toastEvent.emit('error', text);
  },
  warning: (text: string) => {
    toastEvent.emit('warning', text);
  },
};
