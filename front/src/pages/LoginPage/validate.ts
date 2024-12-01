import type { Validate } from '@/hooks/useForm.tsx';

import type { LoginForm } from '@/type/user.ts';

export const lengthValidate: Validate<LoginForm> = ({ value }) => {
  const isRightLength = value.length >= 4 && value.length <= 12;
  if (!isRightLength) return '최소 4자리, 최대 12자리 입니다.';
  return null;
};
