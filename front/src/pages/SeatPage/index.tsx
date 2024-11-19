import { useState } from 'react';

import ReservationResult from '@/pages/SeatPage/ReservationResult.tsx';
import SeatCountAndCaptcha from '@/pages/SeatPage/SeatCountAndCaptcha';
import type { SeatCount } from '@/pages/SeatPage/SeatCountAndCaptcha';
import SectionAndSeat from '@/pages/SeatPage/SectionAndSeat';

type ReservationStep = 'setCount' | 'selectSeats' | 'result '; //TODO 의미 있게 작성하기
const DEFAULT_SEAT_COUNT = 1;
export default function SeatPage() {
  const [seatCount, setSeatCount] = useState<SeatCount>(DEFAULT_SEAT_COUNT);
  const [reservationResult, setReservationResult] = useState<null | { test: string }>(null); //TODO 각 단계 데이터 하나에서 컨트로 funnel구조로
  const [step, setStep] = useState<ReservationStep>('selectSeats'); //예약 결과 페이지
  const selectCount = (count: SeatCount) => {
    setSeatCount(count);
  };
  const setReservation = () => {
    setReservationResult({ test: 'hi' });
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
        setReservationResult={setReservation}
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
