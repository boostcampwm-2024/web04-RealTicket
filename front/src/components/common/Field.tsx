import { PropsWithChildren } from 'react';

import { FieldContext } from '@/contexts/fieldContext';

interface IFieldProps extends PropsWithChildren {
  label: string;
  isValid?: boolean;
  isRequired?: boolean;
  errorMessage?: string;
  helpMessage?: string;
}
export default function Field({
  label,
  children,
  isValid = true,
  isRequired = false,
  errorMessage = '',
  helpMessage = '',
}: IFieldProps) {
  const isHelpMessage = helpMessage.length > 0;
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex justify-between">
        <label htmlFor={label} className="text-heading2">
          {label}
          {isRequired && <span className="text-error">*</span>}
        </label>
        <span className="mt-auto max-w-[70%] truncate text-caption2 text-error hover:overflow-visible">
          {!isValid && errorMessage}
        </span>
      </div>
      <FieldContext.Provider value={{ isValid, htmlFor: label }}>{children}</FieldContext.Provider>
      {isHelpMessage && <span className="text-caption2 text-typo-sub">{helpMessage}</span>}
    </div>
  );
}
