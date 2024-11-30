import { useState } from 'react';
import { useParams } from 'react-router-dom';

import type { CustomError } from '@/api/axios.ts';
import { getEventDetail } from '@/api/event.ts';
import { getPlaceInformation } from '@/api/place.ts';

import Captcha from '@/components/Captcha/index.tsx';

import ReservationResult from '@/pages/ReservationPage/ReservationResult';
import SeatCountContent from '@/pages/ReservationPage/SeatCountContent';
import type { SelectedSeat } from '@/pages/ReservationPage/SectionAndSeat';
import SectionAndSeat from '@/pages/ReservationPage/SectionAndSeat';

import type { EventDetail, PlaceInformation } from '@/type/index.ts';
import type { SeatCount } from '@/type/reservation.ts';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';

type ReservationStep = 'captcha' | 'setCount' | 'selectSeats' | 'result';

export default function ReservationPage() {
  const { eventId } = useParams();
  const { data: event } = useSuspenseQuery<EventDetail, CustomError>({
    queryKey: [`event`, eventId],
    queryFn: getEventDetail(Number(eventId)),
    staleTime: Infinity,
  });
  const { place } = event;
  const { data: placeInformation } = useQuery<PlaceInformation, CustomError>({
    queryKey: [`place/${place.id}`],
    queryFn: getPlaceInformation(Number(place.id)),
    enabled: !!event,
  });

  const [seatCount, setSeatCount] = useState<SeatCount>(DEFAULT_SEAT_COUNT);
  const [reservationResult, setReservationResult] = useState<SelectedSeat[]>([]);
  const [step, setStep] = useState<ReservationStep>('captcha');
  const selectCount = (count: SeatCount) => {
    setSeatCount(count);
  };

  const isReadyReservationResult = reservationResult !== null && step === 'result';

  if (step === 'captcha') {
    return (
      <Captcha
        goNextStep={() => {
          setStep('setCount');
        }}
      />
    );
  }

  if (step === 'setCount') {
    return (
      <SeatCountContent
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
        placeInformation={placeInformation!}
        event={event}
        seatCount={seatCount}
        changeSeatCount={selectCount}
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

const DEFAULT_SEAT_COUNT = 1;
