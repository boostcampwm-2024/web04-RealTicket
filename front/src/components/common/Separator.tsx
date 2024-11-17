import { cx } from 'class-variance-authority';

interface ISeparatorProps {
  direction: 'col' | 'row';
}

export default function Separator({ direction }: ISeparatorProps) {
  return (
    <div
      className={cx(
        direction === 'row' ? 'min-h-[1px] w-full' : 'h-full min-w-[1px]',
        'flex-grow bg-surface-cardBorder',
      )}></div>
  );
}
