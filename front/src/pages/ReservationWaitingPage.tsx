import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { CustomError } from '@/api/axios.ts';
import { getEventDetail } from '@/api/event.ts';
import { getPlaceInformation } from '@/api/place.ts';

import Button from '@/components/common/Button.tsx';
import Icon from '@/components/common/Icon.tsx';

import { getDate, getTime } from '@/utils/date.ts';

import type { EventDetail, PlaceInformation } from '@/type/index.ts';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';

//TODO 타입으로 옮기기

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

export default function ReservationWaitingPage() {
  const navigate = useNavigate();
  const { eventId } = useParams();
  const { data: event } = useSuspenseQuery<EventDetail, CustomError>({
    queryKey: [`events/${eventId}`],
    queryFn: getEventDetail(Number(eventId)),
    staleTime: Infinity,
  });

  const { reservationOpenDate, place, name, runningDate, runningTime } = event;
  const { data: placeInformation, isPending } = useQuery<PlaceInformation, CustomError>({
    queryKey: [`place/${place.id}`],
    queryFn: getPlaceInformation(Number(place.id)),
    enabled: !!event,
    staleTime: Infinity,
  });

  const intervalRef = useRef<number | null>(null); // intervalType
  const [serverTime, setServerTime] = useState(Date.now());
  const restTime = new Date(reservationOpenDate).getTime() - serverTime;
  const isOpen = restTime <= 0;
  //TODO 좌석 초기 데이터
  const renderRestTime = (restTime: number) => {
    const restSeconds = Math.floor(restTime / 1000);
    if (restSeconds <= 0) return <span className="text-display1 text-error">000초</span>;
    if (restSeconds <= 100) {
      return (
        <span className="animate-bounce text-display1 text-warning">
          {restSeconds.toString().padStart(3, '0')}초
        </span>
      );
    } else {
      return (
        <span>{`${Math.floor(restSeconds / SECONDS_PER_HOUR)
          .toString()
          .padStart(2, '0')}시간 ${Math.floor((restSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
          .toString()
          .padStart(2, '0')}분 ${(restSeconds % 60).toString().padStart(2, '0')}초`}</span>
      );
    }
  };

  //TODO 초0 밑으로 떨어지는 거 막기
  useEffect(() => {
    if (intervalRef.current === null) {
      intervalRef.current = setInterval(() => {
        setServerTime(Date.now());
      }, 1000);
      return () => {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, []);

  //TODO 서버 시간 동기화, image loading
  const goSelectPage = () => {
    navigate(`/events/${eventId}`);
  };
  return (
    <div className="flex flex-col gap-8">
      {!isPending && placeInformation ? (
        <img src={placeInformation.layout.overview} width={700} height={420}></img>
      ) : (
        <div>loading</div>
      )}
      <div className="flex flex-col gap-6">
        <h3 className="text-heading1 text-typo">{name}</h3>
        <div className="flex justify-between gap-8">
          <div className="flex flex-col gap-4 text-display1">
            <span>장소 : {place.name}</span>
            <span>관람 시간 : {runningTime}분</span>
            <span>날짜 : {getDate(runningDate)}</span>
            <span>시간 : {getTime(runningDate)}</span>
          </div>
          <div className="flex flex-col justify-between">
            <div className="flex flex-col gap-1 text-typo">
              <span className="flex items-center gap-2 text-heading2">
                <Icon iconName="Clock" />
                예매 오픈 시간
              </span>
              <span> {`${getDate(reservationOpenDate)} ${getTime(reservationOpenDate)}`}</span>
            </div>
            <div className="gap-2S flex flex-col gap-1">
              <span className="flex items-center gap-2 text-heading2">
                <Icon iconName="Clock" />
                예매 오픈까지 남은 시간
              </span>
              {renderRestTime(restTime)}
            </div>
          </div>
        </div>
      </div>
      <Button disabled={!isOpen} className="my-4" onClick={goSelectPage}>
        {isOpen ? (
          <span className="text-label1 text-typo-display">예매하기</span>
        ) : (
          <span className="text-label1 text-typo-disable">예매 대기중</span>
        )}
      </Button>
    </div>
  );
}
