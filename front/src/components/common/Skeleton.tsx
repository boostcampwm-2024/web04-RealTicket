import { HTMLAttributes } from 'react';

import { cx } from 'class-variance-authority';

export default function Skeleton({ className }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(className, `animate-pulse bg-slate-700`)}></div>;
}
