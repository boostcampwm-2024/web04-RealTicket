import { useState } from 'react';

import ReservationResult from '@/pages/ReservationPage/ReservationResult';
import SeatCountAndCaptcha from '@/pages/ReservationPage/SeatCountAndCaptcha';
import type { SeatCount } from '@/pages/ReservationPage/SeatCountAndCaptcha';
import SectionAndSeat from '@/pages/ReservationPage/SectionAndSeat';

type ReservationStep = 'setCount' | 'selectSeats' | 'result '; //TODO 의미 있게 작성하기
const DEFAULT_SEAT_COUNT = 1;
export default function SeatPage() {
  const [seatCount, setSeatCount] = useState<SeatCount>(DEFAULT_SEAT_COUNT);
  const [reservationResult, setReservationResult] = useState<null | string[]>(null); //TODO 각 단계 데이터 하나에서 컨트로 funnel구조로
  const [step, setStep] = useState<ReservationStep>('setCount'); //예약 결과 페이지
  const selectCount = (count: SeatCount) => {
    setSeatCount(count);
  };

  const isReadyReservationResult = reservationResult !== null && step === 'result ';

  if (step === 'setCount') {
    return (
      <SeatCountAndCaptcha
        selectCount={selectCount}
        seatCount={seatCount}
        goNextStep={() => {
          setStep('selectSeats');
        }}
      />
    );
  }
  if (step === 'selectSeats') {
    return (
      <SectionAndSeat
        seatCount={seatCount}
        setReservationResult={setReservationResult}
        goNextStep={() => {
          setStep('result ');
        }}
      />
    );
  }
  if (isReadyReservationResult) {
    return <ReservationResult reservationResult={reservationResult} />;
  }
}
