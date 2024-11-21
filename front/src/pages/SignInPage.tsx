import { useNavigate } from 'react-router-dom';

import { type CustomError } from '@/api/axios.ts';
import { SignData, postSignin } from '@/api/user.ts';

import { useAuthContext } from '@/hooks/useAuthContext.tsx';
import useForm, { type Validate } from '@/hooks/useForm';

import Button from '@/components/common/Button';
import Field from '@/components/common/Field';
import Icon from '@/components/common/Icon';
import Input from '@/components/common/Input';

import { useMutation } from '@tanstack/react-query';
import { AxiosResponse } from 'axios';

type Form = {
  id: string;
  password: string;
};
type ResponseData = {
  loginId: string;
};

const FAILED_MESSAGE = '아이디 또는 비밀번호가 일치하지 않습니다.';
export default function SignInPage() {
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<Form>();
  const { signIn } = useAuthContext();
  const navigation = useNavigate();
  const { mutate, isPending, error } = useMutation<AxiosResponse<ResponseData>, CustomError, SignData>({
    mutationFn: postSignin,
    onError: () => {
      //TODO 토스트 추가
      alert(`로그인 실패, 다시 시도해주세요\n 
        사유 : ${FAILED_MESSAGE}`);
    },
    onSuccess: (data) => {
      //쿠키 저장하기
      const { loginId } = data.data;
      if (signIn) signIn(loginId);
      alert('로그인 성공 '); //TODO toast 추가
      navigation('/');
    },
  });

  const submit = async (data: Form) => {
    const { id, password } = data;
    mutate({ login_id: id, login_password: password });
  };

  return (
    <div className="mx-auto flex">
      <form
        onSubmit={handleSubmit(submit)}
        className="flex w-[420px] flex-col gap-6 rounded-xl border border-surface-cardBorder px-6 py-8 shadow-2xl">
        <h2 className="text-center text-heading1">로그인</h2>
        <Field
          label="Id"
          isValid={!errors.id && !error}
          errorMessage={errors.id ? errors.id : FAILED_MESSAGE}>
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
          errorMessage={errors.password ? errors.password : FAILED_MESSAGE}>
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

const lengthValidate: Validate<Form> = ({ value }) => {
  const isRightLength = value.length >= 4 && value.length <= 12;
  if (!isRightLength) return '최소 4자리, 최대 12자리 입니다.';
  return null;
};
