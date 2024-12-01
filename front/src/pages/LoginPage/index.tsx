import { useNavigate } from 'react-router-dom';

import { type CustomError } from '@/api/axios.ts';
import { type UserData, postLogin } from '@/api/user.ts';

import { useAuthContext } from '@/hooks/useAuthContext.tsx';
import useForm from '@/hooks/useForm';

import { toast } from '@/components/Toast/index.ts';
import Button from '@/components/common/Button';
import Field from '@/components/common/Field';
import Icon from '@/components/common/Icon';
import Input from '@/components/common/Input';

import { lengthValidate } from '@/pages/LoginPage/validate.ts';

import { LOGIN_FAILED_MESSAGE } from '@/constants/user.ts';
import type { LoginForm } from '@/type/user.ts';
import { useMutation } from '@tanstack/react-query';
import { AxiosResponse } from 'axios';

export default function LoginPage() {
  type ResponseData = {
    loginId: string;
  };

  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<LoginForm>();
  const { login } = useAuthContext();
  const navigation = useNavigate();
  const { mutate, isPending, error } = useMutation<AxiosResponse<ResponseData>, CustomError, UserData>({
    mutationFn: postLogin,
    onError: () => {
      toast.error(`로그인 실패\n 사유 : ${LOGIN_FAILED_MESSAGE}`);
    },
    onSuccess: (data) => {
      const { loginId } = data.data;
      if (loginId && login) login(loginId);
      toast.success('로그인 성공');
      navigation('/');
    },
  });

  const submit = async (data: LoginForm) => {
    const { id, password } = data;
    mutate({ loginId: id, loginPassword: password });
  };

  return (
    <div className="mx-auto flex items-center py-8">
      <form
        onSubmit={handleSubmit(submit)}
        className="flex w-[420px] flex-col gap-6 rounded-xl border border-surface-cardBorder px-6 py-8 shadow-2xl">
        <h2 className="text-center text-heading1">로그인</h2>
        <Field
          label="Id"
          isValid={!errors.id && !error}
          errorMessage={errors.id ? errors.id : LOGIN_FAILED_MESSAGE}>
          <Input
            disabled={isPending}
            {...register('id', {
              validate: lengthValidate,
            })}
            placeholder="아이디를 입력해주세요."
          />
        </Field>
        <Field
          label="Password"
          isValid={!errors.password && !error}
          errorMessage={errors.password ? errors.password : LOGIN_FAILED_MESSAGE}>
          <Input
            type="password"
            disabled={isPending}
            autoComplete="off"
            {...register('password', {
              validate: lengthValidate,
            })}
            placeholder="비밀번호를 입력해주세요."
          />
        </Field>
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Icon iconName="Loading" className="animate-spin" />
              <span className="text-label1 text-typo-disable">로그인 중...</span>
            </>
          ) : (
            <span className="text-label1 text-typo-display">로그인</span>
          )}
        </Button>
      </form>
    </div>
  );
}
