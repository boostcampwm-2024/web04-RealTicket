import { InputHTMLAttributes, forwardRef } from 'react';

import { useFieldContext } from '@/hooks/useFieldContext';

import { cx } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, checked, ...rest },
  ref,
) {
  const { isValid, htmlFor } = useFieldContext();
  const isNullHtmlFor = htmlFor === null;

  return (
    <input
      id={!isNullHtmlFor ? htmlFor : undefined}
      ref={ref}
      checked={checked}
      className={twMerge(
        cx(
          'w-full appearance-none rounded px-4 py-2',
          'border text-display2 text-typo outline-none',
          'outline-offset-0 placeholder:text-caption2 placeholder:text-typo-sub',
          checked && 'border-success',
          isValid
            ? 'border-surface-sub focus-within:outline-surface focus:outline-surface'
            : 'border-error focus:outline-error focus-visible:outline-error',
        ),
        className,
      )}
      {...rest}
    />
  );
});
export default Input;
