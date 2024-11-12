import { PropsWithChildren } from 'react';

import { fieldContext } from '@/context/fieldContext';

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
        <span className="text-heading2">
          {label}
          {isRequired && <span className="text-error">*</span>}
        </span>
        <span className="mt-auto max-w-[70%] truncate text-caption2 text-error hover:overflow-visible">
          {!isValid && errorMessage}
        </span>
      </div>
      <fieldContext.Provider value={{ isValid }}>{children}</fieldContext.Provider>
      {isHelpMessage && <span className="text-caption2 text-typo-sub">{helpMessage}</span>}
    </div>
  );
}
