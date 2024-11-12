/*
Input 태그
- forwardRef 
- 단순 스타일링 

- Field가 error시 border가 색이 변경되야한다.  error는 외부에서도 주입될 수 있어야 한다. 
*/
import { InputHTMLAttributes } from 'react';

import { cx } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

interface IInputProps extends InputHTMLAttributes<HTMLInputElement> {
  isError?: boolean;
}

export default function Input({ isError, className, ...rest }: IInputProps) {
  return (
    <input
      className={twMerge(
        cx(
          'w-full rounded px-4 py-2',
          'text-display2 text-typo',
          'border border-surface-sub focus:border-surface',
          'placeholder:text-caption2 placeholder:text-typo-sub',
          {
            'border-error': isError,
          },
        ),
        className,
      )}
      {...rest}
    />
  );
}
