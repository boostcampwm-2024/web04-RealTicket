import ToastEvent from '@/events/ToastEvent.ts';

export { default as ToastContainer } from '@/components/Toast/ToastContainer.tsx';

const toastEvent = ToastEvent.getInstance();
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
