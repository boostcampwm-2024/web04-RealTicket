import { useEffect, useState } from 'react';

import { ToastType } from '@/components/Toast/ToastContainer.tsx';
import Button from '@/components/common/Button.tsx';
import Icon, { IconName } from '@/components/common/Icon.tsx';

import { cva, cx } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

interface ToastProps {
  className?: string;
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
  const [isClose, setIsClose] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(handleClose, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  const handleClose = () => {
    setIsClose(true);
  };

  return (
    <div
      className={twMerge(cx([toastVariant({ type }), isClose ? 'animate-fade-out' : 'animate-fade-in']))}
      onAnimationEnd={() => {
        if (isClose) {
          close();
        }
      }}>
      <Icon iconName={typeIconNameMap[type]} color={'display'} size={'big'} />
      <span className="text-display1 text-typo-display">{`${text}`}</span>
      <Button className="absolute right-1 top-0" size={'fit'} intent={'ghost'} onClick={handleClose}>
        <span className="text-label2 text-typo-display">x</span>
      </Button>
    </div>
  );
}

const toastVariant = cva(
  `flex gap-4 px-4 py-3 relative h-fit w-[300px] items-center rounded border whitespace-pre-line z-20`,
  {
    variants: {
      type: {
        error: `bg-error`,
        success: 'bg-success',
        warning: `bg-warning`,
      },
    },
  },
);
