//에니메이션 처리 고려
import { cx } from 'class-variance-authority';

interface ProgressbarProps {
  value: number;
}

export default function Progressbar({ value }: ProgressbarProps) {
  const rounded = Math.round(value);
  const percent = rounded > 100 ? 100 : rounded;
  return (
    <div className="relative h-6 w-full overflow-hidden rounded-full bg-surface-sub">
      <div
        className={cx(
          `absolute bottom-0 left-[-100%] h-full w-[100%] transform animate-pulse bg-primary transition-transform duration-300 ease-out`,
          `translate-x-[${percent}%]`,
        )}></div>
    </div>
  );
}
