import { ChangeEvent } from 'react';
import { Link } from 'react-router-dom';

import { postSeatCount } from '@/api/booking.ts';

import Button from '@/components/common/Button';
import Separator from '@/components/common/Separator.tsx';

import { SEAT_COUNT_LIST } from '@/constants/reservation.ts';
import type { SeatCount } from '@/type/reservation.ts';
import { useMutation } from '@tanstack/react-query';
import { cx } from 'class-variance-authority';

interface ISeatCountContentProps {
  seatCount: SeatCount;
  selectCount: (count: SeatCount) => void;
  goNextStep: () => void;
}
//section 선택 페이지는 좌석 선택시에도 사용된다\

export default function SeatCountContent({ selectCount, goNextStep, seatCount }: ISeatCountContentProps) {
  const { mutate: postSeatCountMutate, isPending } = useMutation({ mutationFn: postSeatCount });
  const selectSeatCount = (event: ChangeEvent<HTMLSelectElement>) => {
    const selectedCount = Number(event.target.value);
    if (selectedCount == seatCount) return;
    selectCount(selectedCount as SeatCount);
  };

  const handleNextStep = async () => {
    await postSeatCountMutate(seatCount);
    goNextStep();
  };

  return (
    <div className="flex w-[420px] flex-col gap-8 rounded-xl border border-surface-cardBorder p-6 shadow-xl">
      <div className="flex flex-col gap-2 text-center">
        <h2 className="text-heading1">좌석 개수 선택</h2>
        <p className="text-display2 text-typo-sub">예매를 진행할 좌석의 개수를 선택해주세요.</p>
      </div>
      <Separator direction="row" />
      <label htmlFor="seatCount" className="flex flex-col gap-4">
        <span className="text-heading2">좌석 개수</span>
        <select
          id="seatCount"
          className="w-full rounded border px-4 py-2"
          defaultValue={seatCount}
          onChange={selectSeatCount}>
          {SEAT_COUNT_LIST.map((count) => (
            <option key={count} className="" value={count}>{`${count} 개`}</option>
          ))}
        </select>
      </label>
      <Separator direction="row" />
      <ul className="list-disc px-4">
        {HELP_MESSAGE_LIST.map((message) => (
          <li key={message} className="text-caption1 text-typo-sub">
            {message}
          </li>
        ))}
      </ul>
      <div className="flex gap-4">
        <Button color={'cancel'} asChild>
          <Link to="/">
            <span className="text-label1 text-typo-display">취소</span>
          </Link>
        </Button>
        <Button disabled={isPending} color="primary" onClick={handleNextStep}>
          <span className={cx('text-typo-display', 'text-label1')}>확인</span>
        </Button>
      </div>
    </div>
  );
}
const HELP_MESSAGE_LIST = ['최대 4매까지 선택 가능합니다.'];
