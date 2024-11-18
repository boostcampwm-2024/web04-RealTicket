import useForm, { Validate } from '@/hooks/useForm';

import Button from '@/components/common/Button';
import Field from '@/components/common/Field';
import Icon from '@/components/common/Icon';
import Input from '@/components/common/Input';

export default function SignInPage() {
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm();
  const submit = async (data: unknown) => {
    console.log(data);
  };
  //TODO submitting에는 disable 처리
  const is = true;
  return (
    <div className="mx-auto flex">
      <form
        onSubmit={handleSubmit(submit)}
        className="flex w-[420px] flex-col gap-6 rounded-xl border border-surface-cardBorder px-6 py-8 shadow-2xl">
        <h2 className="text-center text-heading1">로그인</h2>
        <Field label="Id" isValid={!errors.id} errorMessage={errors.id}>
          <Input
            disabled={is}
            {...register('id', {
              validate: lengthValidate,
            })}
            placeholder="아이디를 입력해주세요."
          />
        </Field>
        <Field label="Password" isValid={!errors.password} errorMessage={errors.password}>
          <Input
            type="password"
            disabled={is}
            autoComplete="off"
            {...register('password', {
              validate: lengthValidate,
            })}
            placeholder="비밀번호를 입력해주세요."
          />
        </Field>
        {/* 로그인 api 연결중, pass 안된다면 disable */}
        <Button type="submit" disabled={is}>
          {is ? (
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

const lengthValidate: Validate = ({ value }) => {
  const isRightLength = value.length >= 4 && value.length <= 12;
  if (!isRightLength) return '최소 4자리, 최대 12자리 입니다.';
  return null;
};
