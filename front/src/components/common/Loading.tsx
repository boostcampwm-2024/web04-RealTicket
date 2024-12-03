import Icon from '@/components/common/Icon.tsx';

import { cx } from 'class-variance-authority';

interface LoadingProps {
  className?: string;
}
export default function Loading({ className }: LoadingProps) {
  return (
    <div className={cx('absolute flex w-full items-center justify-center', className)}>
      <div className="flex flex-col items-center gap-4">
        <Icon iconName="Loading" className="h-16 w-16 animate-spin" color={'primary'} />
        <span className="text-heading3 text-typo">loading..</span>
      </div>
    </div>
  );
}
