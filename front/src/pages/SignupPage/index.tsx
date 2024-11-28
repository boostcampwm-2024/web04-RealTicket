import { useNavigate } from 'react-router-dom';

import { type CustomError } from '@/api/axios.ts';
import { type UserData, postSignup } from '@/api/user.ts';

import useForm, { type Validate } from '@/hooks/useForm.tsx';

import Button from '@/components/common/Button.tsx';
import Field from '@/components/common/Field.tsx';
import Icon from '@/components/common/Icon.tsx';
import Input from '@/components/common/Input.tsx';

import { ROUTE_URL } from '@/constants/index.ts';
import { useMutation } from '@tanstack/react-query';
import { AxiosResponse } from 'axios';

type Form = {
  id: string;
  password: string;
  checkPassword: string;
};
export default function SignUpPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>();
  const navigate = useNavigate();
  const { mutate, error, isPending } = useMutation<AxiosResponse, CustomError, UserData>({
    mutationFn: postSignup,
    onError: (error) => {
      alert(`회윈가입에 실패했습니다. 다시 시도해주세요.\n
        사유:${error.response?.data.message}`);
    },
    onSuccess: () => {
      alert('화원가입에 성공했습니다. 로그인 해주세요');
      navigate(ROUTE_URL.USER.LOGIN);
    },
  });

  const submit = async (data: Form) => {
    const { id, password } = data;
    await mutate({ loginId: id, loginPassword: password });
  };
  const is = false;
  //TODO Id 중복 체크 필
  return (
    <div className="mx-auto flex">
      <form
        onSubmit={handleSubmit(submit)}
        className="flex w-[420px] flex-col gap-6 rounded-xl border border-surface-cardBorder px-6 py-8 shadow-2xl">
        <h2 className="text-center text-heading1">회원가입</h2>
        <Field
          label="Id"
          isValid={!errors.id && !error}
          errorMessage={errors.id ? errors.id : error?.response?.data.message}
          helpMessage="4자 이상 12자 이하의 영문 소문자와 숫자로 구성해주세요.">
          <Input
            disabled={isPending}
            {...register('id', {
              validate: validate,
            })}
            placeholder="아이디를 입력해주세요."
          />
        </Field>
        <Field
          label="Password"
          isValid={!errors.password && !error}
          errorMessage={errors.password ? errors.password : error?.response?.data.message}
          helpMessage="4자 이상 12자 이하의 영문 소문자와 숫자로 구성해주세요.">
          <Input
            type="password"
            disabled={isPending}
            autoComplete="off"
            {...register('password', {
              validate: validate,
            })}
            placeholder="비밀번호를 입력해주세요."
          />
        </Field>
        <Field
          label="CheckPassword"
          isValid={!errors.checkPassword && !error}
          errorMessage={errors.checkPassword ? errors.checkPassword : error?.response?.data.message}>
          <Input
            type="password"
            disabled={is}
            autoComplete="off"
            {...register('checkPassword', {
              validate: passwordCheckValidate,
            })}
            placeholder="비밀번호를 입력해주세요."
          />
        </Field>

        <Button type="submit" disabled={is}>
          {isPending ? (
            <>
              <Icon iconName="Loading" className="animate-spin" />
              <span className="text-label1 text-typo-disable">회원가입 중...</span>
            </>
          ) : (
            <span className="text-label1 text-typo-display">회원가입 </span>
          )}
        </Button>
      </form>
    </div>
  );
}

const validate: Validate<Form> = ({ value }) => {
  const isRightLength = value.length >= 4 && value.length <= 12;
  const patternReg = new RegExp(/^[a-z0-9]+$/);
  const isRightPattern = patternReg.test(value);
  if (!isRightLength) return '최소 4자리, 최대 12자리 입니다.';
  if (!isRightPattern) return '소문자 영어, 숫자 조합으로 작성해주세요.';
  return null;
};
const passwordCheckValidate: Validate<Form> = ({ value, formData }) => {
  const { password } = formData;
  const isEqual = password == value;
  if (!isEqual) return '비밀번호와 일치하지 않습니다.';
  return null;
};
