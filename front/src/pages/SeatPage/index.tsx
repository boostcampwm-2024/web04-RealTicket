import { useState } from 'react';

import ReservationResult from '@/pages/SeatPage/ReservationResult.tsx';
import SeatCountAndCaptcha from '@/pages/SeatPage/SeatCountAndCaptcha';
import type { SeatCount } from '@/pages/SeatPage/SeatCountAndCaptcha';
import SectionAndSeat from '@/pages/SeatPage/SectionAndSeat';

type ReservationStep = 'setCount' | 'selectSeats' | 'result ';
const DEFAULT_SEAT_COUNT = 1;
export default function SeatPage() {
  const [seatCount, setSeatCount] = useState<SeatCount>(DEFAULT_SEAT_COUNT);
  const [step, setStep] = useState<ReservationStep>('setCount'); //예약 결과 페이지
  const [reservationResult, setReservationResult] = useState<null | { test: string }>(null); //passed 말고 스텝을 만들어서 관리
  const selectCount = (count: 1 | 2 | 3 | 4) => {
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
