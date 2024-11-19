import { useEffect, useRef, useState } from 'react';

import Button from '@/components/common/Button.tsx';
import Icon from '@/components/common/Icon.tsx';

import { getDate, getTime } from '@/utils/date.ts';

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;

export default function ReservationWaitingPage() {
  const { title, stageUrl, place, runningTime, runningDate, reservationOpenDate } = event;
  const intervalRef = useRef<number | null>(null); // intervalType
  const [serverTime, setServerTime] = useState(Date.now());
  const restTime = reservationOpenDate.getTime() - serverTime;
  const isOpen = false;
  //TODO 애니메이션 효과, 좀 더 세분화
  const renderRestTime = (restTime: number) => {
    const restSeconds = Math.floor(restTime / 1000);
    if (restSeconds <= 0) return <span className="text-display1 text-error">000초</span>;
    if (restSeconds <= 100) {
      return <span className="text-display1 text-warning">{restTime.toString().padStart(3, '0')}초</span>;
    } else {
      return (
        <span>{`${Math.floor(restSeconds / SECONDS_PER_HOUR)
          .toString()
          .padStart(2, '0')}시간${Math.floor((restSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)
          .toString()
          .padStart(2, '0')}분${(restSeconds % 60).toString().padStart(2, '0')}초`}</span>
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

  //TODO 서버 시간 동기화

  return (
    <div className="flex flex-col gap-8">
      <img src={stageUrl} width={700} height={420}></img>
      <div className="flex flex-col gap-6">
        <h3 className="text-heading1 text-typo">{title}</h3>
        <div className="flex justify-between gap-8">
          <div className="flex flex-col gap-4 text-display1">
            <span>장소 : {place}</span>
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
      <Button disabled={!isOpen} className="my-4">
        {isOpen ? (
          <span className="text-label1 text-typo-display">예매하기</span>
        ) : (
          <span className="text-label1 text-typo-disable">예매 대기중</span>
        )}
      </Button>
    </div>
  );
}

const event = {
  id: 1,
  title: '뮤지컬: 레미제라블',
  stageUrl: '/images/stageSimple.svg',
  place: '서울예술의전당 오페라극장',
  runningTime: 180, // 3시간
  runningDate: new Date('2024-12-20T19:00:00'), // 저녁 7시
  reservationOpenDate: new Date('2024-11-19T10:00:00'), // 오전 10시 예약 오픈
  reservationCloseDate: new Date('2024-12-20T18:59:00'), // 공연 직전 예약 마감
};
