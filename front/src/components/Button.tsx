import { ButtonHTMLAttributes } from 'react';

import Slot from '@/components/Slot';

import { VariantProps, cva } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

interface IButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export default function Button({ className, children, intent, size, color, asChild, ...rest }: IButtonProps) {
  const Element = asChild ? Slot : 'button';
  return (
    <Element className={twMerge(buttonVariants({ color, intent, size }), className)} {...rest}>
      {children}
    </Element>
  );
}

const buttonVariants = cva(
  [
    'button p-2 flex items-center justify-center gap-x-2 rounded',
    'disabled:bg-surface-disabled disabled:border-surface-disabled disabled:opacity-50 disabled:cursor-not-allowed',
  ],
  {
    variants: {
      color: {
        default: ['border-surface', 'bg-surface', 'hover:bg-surface/90'],
        success: ['border-success', 'bg-success', 'hover:bg-success/90'],
        primary: ['border-primary', 'bg-primary', 'hover:bg-primary/90'],
        error: ['border-error', 'bg-error', 'hover:bg-error/90'],
        cancel: ['bg-surface-cancel', 'hover:bg-surface-cancel/90'],
      },
      intent: {
        default: [],
        outline: ['bg-transparent', 'border', 'hover:bg-transparent', 'hover:bg-surface-hover'],
        ghost: ['bg-transparent', 'border-transparent', 'hover:bg-transparent'],
      },
      size: {
        full: ['w-full'],
        middle: ['w-fit', 'px-4'],
        fit: ['w-fit'],
      },
    },
    defaultVariants: {
      color: 'default',
      intent: 'default',
      size: 'full',
    },
  },
);
