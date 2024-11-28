import * as Icons from '@/assets/icons';
//TODO 최적화 필요, 필요한 icon만 호출되도록, 캐시
import { VariantProps, cva, cx } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

export type IconName = keyof typeof Icons;
interface IIconProps extends VariantProps<typeof iconVariants> {
  className?: string;
  iconName: IconName;
}

export default function Icon({ className, iconName, color, size }: IIconProps) {
  const Icon = Icons[iconName];

  return <Icon className={twMerge(cx([iconVariants({ color, size }), className]))}></Icon>;
}

const iconVariants = cva([], {
  variants: {
    color: {
      default: ['fill-typo stroke-typo'],
      disabled: ['fill-typo-disable stroke-typo-disable'],
      display: ['fill-typo-display stroke-typo-display'],
      success: ['fill-success stroke-success'],
      primary: ['fill-primary stroke-primary'],
      error: ['fill-error stroke-error'],
      warning: ['fill-warning stroke-warning'],
    },
    size: {
      small: ['w-6 h-6'],
      big: ['w-8 h-8'],
    },
  },
  defaultVariants: { color: 'default', size: 'small' },
});
