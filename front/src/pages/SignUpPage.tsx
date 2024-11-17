import useForm, { Validate } from '@/hooks/useForm.tsx';

import Button from '@/components/common/Button.tsx';
import Field from '@/components/common/Field.tsx';
import Icon from '@/components/common/Icon.tsx';
import Input from '@/components/common/Input.tsx';

export default function SignUpPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();
  const submit = async (data: unknown) => {
    console.log(data);
  };
  const is = false;
  return (
    <div className="mx-auto flex">
      <form
        onSubmit={handleSubmit(submit)}
        className="flex w-[420px] flex-col gap-6 rounded-xl border border-surface-cardBorder px-6 py-8 shadow-2xl">
        <h2 className="text-center text-heading1">로그인</h2>
        <Field
          label="Id"
          isValid={!errors.id}
          errorMessage={errors.id}
          helpMessage="4자 이상 12자 이하의 영문 소문자와 숫자로 구성해주세요.">
          <Input
            disabled={is}
            {...register('id', {
              validate: validate,
            })}
            placeholder="아이디를 입력해주세요."
          />
        </Field>
        <Field
          label="Password"
          isValid={!errors.password}
          errorMessage={errors.password}
          helpMessage="4자 이상 12자 이하의 영문 소문자와 숫자로 구성해주세요.">
          <Input
            type="password"
            disabled={is}
            autoComplete="off"
            {...register('password', {
              validate: validate,
            })}
            placeholder="비밀번호를 입력해주세요."
          />
        </Field>
        <Field label="CheckPassword" isValid={!errors.checkPassword} errorMessage={errors.checkPassword}>
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
          {is ? (
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

const validate: Validate = ({ value }) => {
  const isRightLength = value.length >= 4 && value.length <= 12;
  const patternReg = new RegExp(/^[a-z0-9]+$/);
  const isRightPattern = patternReg.test(value);
  if (!isRightLength) return '최소 4자리, 최대 12자리 입니다.';
  if (!isRightPattern) return '소문자 영어, 숫자 조합으로 작성해주세요.';
  return null;
};
const passwordCheckValidate: Validate = ({ value, formData }) => {
  const { password } = formData;
  const isEqual = password == value;
  if (!isEqual) return '비밀번호와 일치하지 않습니다.';
  return null;
};
