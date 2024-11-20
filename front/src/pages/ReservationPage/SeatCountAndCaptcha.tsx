import { ChangeEvent, useState } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';
import { Link } from 'react-router-dom';

import Button from '@/components/common/Button';

import { cx } from 'class-variance-authority';

interface ISeatCountAndCaptchaProps {
  seatCount: SeatCount;
  selectCount: (count: SeatCount) => void;
  goNextStep: () => void;
}
//section 선택 페이지는 좌석 선택시에도 사용된다\
const SEAT_COUNT_LIST = [1, 2, 3, 4] as const;
export type SeatCount = (typeof SEAT_COUNT_LIST)[number];

export default function SeatCountAndCaptcha({
  selectCount,
  goNextStep,
  seatCount,
}: ISeatCountAndCaptchaProps) {
  const [isPassedCaptcha, setIsPassedCaptcha] = useState<boolean>(false);
  const selectSeatCount = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedCount = Number(event.target.value);
    if (selectedCount == seatCount) return;
    selectCount(selectedCount as SeatCount);
  };
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  return (
    <div>
      <label htmlFor="seatCount">
        예매 매수 선택
        <select id="seatCount" className="w-full rounded border px-4 py-2" onChange={selectSeatCount}>
          {SEAT_COUNT_LIST.map((count) => (
            <option className="" value={count}>{`${count} 매`}</option>
          ))}
        </select>
      </label>
      <div>captcha</div>
      <ReCAPTCHA
        //TODO 환경변수
        sitekey={siteKey}
        onChange={() => {
          setIsPassedCaptcha(true);
        }}></ReCAPTCHA>

      <div className="flex gap-2">
        <Button color={'cancel'} asChild>
          <Link to="/">
            <span className="text-label1 text-typo-display">취소</span>
          </Link>
        </Button>
        <Button color="primary" onClick={goNextStep} disabled={!isPassedCaptcha}>
          <span className={cx(isPassedCaptcha ? 'text-typo-display' : 'text-typo-disable', 'text-label1')}>
            확인
          </span>
        </Button>
      </div>
    </div>
  );
}
