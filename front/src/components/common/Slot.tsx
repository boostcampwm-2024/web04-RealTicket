import { cloneElement, isValidElement } from 'react';
import type { ReactNode } from 'react';

interface ISlotProps {
  children: ReactNode;
}
export default function Slot({ children, ...rest }: ISlotProps) {
  if (!isValidElement(children)) {
    console.warn('slot에서는 react element만 올 수 있습니다.');
    return null;
  }
  return cloneElement(children, { ...rest, ...children.props });
}
