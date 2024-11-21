import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { getMockEventDetail } from '@/api/event.ts';

import ReservationResult from '@/pages/ReservationPage/ReservationResult';
import SeatCountAndCaptcha from '@/pages/ReservationPage/SeatCountAndCaptcha';
import type { SeatCount } from '@/pages/ReservationPage/SeatCountAndCaptcha';
import SectionAndSeat from '@/pages/ReservationPage/SectionAndSeat';

import { EventDetail } from '@/type/index.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { AxiosResponse } from 'axios';

type ReservationStep = 'setCount' | 'selectSeats' | 'result';
const DEFAULT_SEAT_COUNT = 1;
export default function ReservationPage() {
  const { eventId } = useParams();
  const { data } = useSuspenseQuery<AxiosResponse<EventDetail>>({
    queryKey: ['event'],
    queryFn: getMockEventDetail(Number(eventId)),
  });
  const event = data.data;

  const [seatCount, setSeatCount] = useState<SeatCount>(DEFAULT_SEAT_COUNT);
  const [reservationResult, setReservationResult] = useState<null | string[]>(['']); //TODO 각 단계 데이터 하나에서 컨트로 funnel구조로
  const [step, setStep] = useState<ReservationStep>('setCount');
  const selectCount = (count: SeatCount) => {
    setSeatCount(count);
  };

  const isReadyReservationResult = reservationResult !== null && step === 'result';

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
        event={event}
        seatCount={seatCount}
        setReservationResult={setReservationResult}
        goNextStep={() => {
          setStep('result');
        }}
      />
    );
  }
  if (isReadyReservationResult) {
    return <ReservationResult event={event} reservationResult={reservationResult} />;
  }
}

// const event: Event = {
//   id: 1,
//   title: "IU 2024 콘서트 'I and You'",
//   place: { id: 1, name: '서울 올림픽공원 체조경기장' },
//   runningTime: 120, // 2시간
//   price: 124000,
//   runningDate: new Date('2024-12-10T19:00:00'),
//   reservationOpenDate: new Date('2024-11-15T10:00:00'),
//   reservationCloseDate: new Date('2024-12-10T18:00:00'),
//   actors: '아이유 (IU)',
// };
// interface Event {
//   id: number;
//   title: string;
//   place: { id: number; name: string };
//   price: number;
//   runningTime: number;
//   runningDate: Date;
//   reservationOpenDate: Date;
//   reservationCloseDate: Date;
//   actors: string;
// }
