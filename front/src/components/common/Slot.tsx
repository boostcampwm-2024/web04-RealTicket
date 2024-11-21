import { cloneElement, isValidElement } from 'react';
import type { ReactNode } from 'react';

interface ISlotProps {
  children: ReactNode;
  className?: string;
}
export default function Slot({ children, className, ...rest }: ISlotProps) {
  if (!isValidElement(children)) {
    console.warn('slot에서는 react element만 올 수 있습니다.');
    return null;
  }

  const childClassName = children.props.className || '';
  return cloneElement(children, {
    ...rest,
    ...children.props,
    className: `${className || ''} ${childClassName}`.trim(),
  });
}
