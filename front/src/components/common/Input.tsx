import { InputHTMLAttributes, forwardRef } from 'react';

import { useFieldContext } from '@/contexts/fieldContext';
import { cx } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

interface IInputProps extends InputHTMLAttributes<HTMLInputElement> {
  isError?: boolean;
}
const Input = forwardRef<HTMLInputElement, IInputProps>(function Input({ isError, className, ...rest }, ref) {
  const { isValid, htmlFor } = useFieldContext();
  const isNullHtmlFor = htmlFor === '';
  const isErrorStatus = isError || !isValid;
  return (
    <input
      id={!isNullHtmlFor ? htmlFor : undefined}
      ref={ref}
      className={twMerge(
        cx(
          'w-full rounded px-4 py-2',
          'border text-display2 text-typo outline-none',
          'outline-offset-0 placeholder:text-caption2 placeholder:text-typo-sub',
          isErrorStatus
            ? 'border-error focus:outline-error focus-visible:outline-error'
            : 'border-surface-sub focus-within:outline-surface focus:outline-surface',
        ),
        className,
      )}
      {...rest}
    />
  );
});
export default Input;
