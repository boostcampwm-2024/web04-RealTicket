import { ToastType } from '@/components/Toast/ToastContainer.tsx';
import Button from '@/components/common/Button.tsx';
import Icon, { IconName } from '@/components/common/Icon.tsx';

import { cva } from 'class-variance-authority';

interface ToastProps {
  type: ToastType;
  text: string;
  close: () => void;
}

const typeIconNameMap: Record<ToastType, IconName> = {
  success: 'CheckCircle',
  error: 'XCircle',
  warning: 'Alert',
};

export default function Toast({ type, text, close }: ToastProps) {
  return (
    <div className={toastVariant({ type })}>
      <Icon iconName={typeIconNameMap[type]} color={'display'} size={'big'} />
      <span className="text-heading2 text-typo-display">{`${text}`}</span>
      <Button className="absolute right-1 top-0" size={'fit'} intent={'ghost'} onClick={close}>
        <span className="text-label2 text-typo-display">x</span>
      </Button>
    </div>
  );
}

const toastVariant = cva(`flex gap-4 px-4 py-4 relative h-fit w-[240px] items-center rounded`, {
  variants: {
    type: {
      error: `bg-error`,
      success: 'bg-success',
      warning: `bg-warning`,
    },
  },
});
