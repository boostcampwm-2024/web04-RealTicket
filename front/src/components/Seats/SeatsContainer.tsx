import { PropsWithChildren } from 'react';

import { SEAT_BOX_SIZE } from '@/constants/index.ts';

interface ISeatContainerProps extends PropsWithChildren {
  colLength: number;
  rowLength: number;
}

export default function SeatsContainer({ children, colLength, rowLength }: ISeatContainerProps) {
  return (
    <svg
      viewBox={`0 0 ${rowLength * SEAT_BOX_SIZE} ${colLength * SEAT_BOX_SIZE}`}
      width={'100%'}
      height={'100%'}>
      {children}
    </svg>
  );
}
