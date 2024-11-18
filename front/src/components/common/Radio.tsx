import { cx } from 'class-variance-authority';

interface IRadio {
  group: string;
  value: string;
  checked: boolean;
  subText?: string;
  onClick: () => void;
  className?: string;
}
//TODO Input, Field로 대체 가능?

export default function Radio({ group, value, checked, subText, onClick, className }: IRadio) {
  return (
    <label
      htmlFor={value}
      className={cx(
        'flex w-full cursor-pointer flex-col items-start rounded border-2 px-4 py-2 hover:border-success/30',
        checked && 'border-success',
        className,
      )}
      onClick={onClick}>
      <input
        id={value}
        className="h-0 w-0 appearance-none"
        name={group}
        type="radio"
        value={value}
        checked={checked}
      />
      <div className="text-display2 text-typo">{value}</div>
      {subText && <div className="text-caption2 text-typo-sub">{subText}</div>}
    </label>
  );
}
