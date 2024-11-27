import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { LoadCanvasTemplate, loadCaptchaEnginge, validateCaptcha } from 'react-simple-captcha';

import Button from '@/components/common/Button.tsx';
import Field from '@/components/common/Field.tsx';
import Input from '@/components/common/Input.tsx';
import Separator from '@/components/common/Separator.tsx';

import './index.css';

interface CaptchaProps {
  goNextStep: () => void;
}
//TODO 취소 버튼 관리
export default function Captcha({ goNextStep }: CaptchaProps) {
  const [inputData, setInputData] = useState<string>('');
  const [isValid, setIsValid] = useState<boolean>(true);
  const InputRef = useRef(null);
  useEffect(() => {
    loadCaptchaEnginge(CAPTCHA_TEXT_LENGTH, 'white', 'black', 'upper');
  }, []);
  const changeInput = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    const upperValue = value.toUpperCase();
    setInputData(upperValue);
  };
  const validateAndGoNextStep = () => {
    if (validateCaptcha(inputData)) {
      //TODO 토스트
      goNextStep();
    } else {
      setIsValid(false);
      if (InputRef.current) {
        (InputRef.current! as HTMLInputElement).focus();
      }
    }
  };

  return (
    <div className="flex w-[420px] flex-col gap-8 rounded-xl border border-surface-cardBorder p-6 shadow-xl">
      <div className="flex flex-col gap-2 text-center">
        <h2 className="text-heading1">자동 예매 방지 문자</h2>
        <p className="text-display2 text-typo-sub">부정 예매 방지를 위해 보안 문자를 정확히 입력해주세요.</p>
      </div>

      <Separator direction="row" />
      <div className="captcha">
        <LoadCanvasTemplate reloadText=" " />
      </div>
      <Field label="입력" isValid={isValid} errorMessage="보안문자를 정확히 입력해주세요">
        <Input
          ref={InputRef}
          placeholder="대소문자 구분없이 보안문자 입력"
          value={inputData}
          onChange={changeInput}
        />
      </Field>
      <Separator direction="row" />
      <ul className="list-disc px-4">
        {HELP_MESSAGE_LIST.map((message) => (
          <li key={message} className="text-caption1 text-typo-sub">
            {message}
          </li>
        ))}
      </ul>

      <div className="flex gap-4">
        <Button color={'cancel'}>
          <span className="text-label1 text-typo-display">취소</span>
        </Button>
        <Button color={'primary'} onClick={validateAndGoNextStep}>
          <span className="text-label1 text-typo-display">확인</span>
        </Button>
      </div>
    </div>
  );
}
const CAPTCHA_TEXT_LENGTH = 6;
const HELP_MESSAGE_LIST = [
  '대소문자 구분 없이 입력해주세요.',
  '문자가 정확히 보기 어려우시면 보안문자 우측의 새로고침 버튼을 눌러주세요.',
];
