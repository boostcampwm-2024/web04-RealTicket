import { useState } from 'react';
import { useParams } from 'react-router-dom';

import Button from '@/components/common/Button.tsx';
import Radio from '@/components/common/Radio.tsx';
import Separator from '@/components/common/Separator';

import { getDate, getDay, getTime } from '@/utils/date.ts';

import { cx } from 'class-variance-authority';

//TODO 페이지 계층 컴포넌트 분리
export default function ProgramDetailPage() {
  const { programId } = useParams();
  console.log(programId);
  const { events } = programData;
  const [selected, setSelected] = useState<{ date: null | string; time: null | string }>({
    date: null,
    time: null,
  });
  const dateList = [...new Set(events.map((event) => event.runningDate.toDateString()))];
  const startDate = dateList[0];
  const lastDate = dateList[dateList.length - 1];
  const isOneDay = startDate === lastDate;

  const filteredDateEvents = events.filter((event) => {
    const date = event.runningDate.toDateString();
    return date === selected.date;
  });
  const timeList = [...new Set(filteredDateEvents.map((event) => getTime(event.runningDate)))];
  const selectedEvent = filteredDateEvents.find((event) => getTime(event.runningDate) === selected.time);
  return (
    <div className="flex flex-col gap-8">
      <ProgramInformation {...programData} lastDate={lastDate} startDate={startDate} isOneDay={isOneDay} />
      <div className="flex flex-col gap-2">
        <div className="flex gap-8">
          {MENU.map((item) => {
            if (item == null) return <Separator direction="col" />;
            const { title, caption } = item;
            return (
              <div className="flex w-full flex-grow flex-col px-4 py-2">
                <span className="text-heading3 text-typo">{title}</span>
                <span className="text-caption2 text-typo-sub">{caption}</span>
              </div>
            );
          })}
        </div>
        <Separator direction="row" />
        <div className="flex gap-8">
          <div className="flex flex-grow basis-0 flex-col gap-2">
            {dateList.map((date) => (
              <Radio
                group="date"
                value={getDate(new Date(date))}
                subText={getDay(new Date(date))}
                checked={date == selected.date}
                onClick={() => {
                  if (selected.date === date) return;
                  setSelected({ time: null, date: date });
                }}
              />
            ))}
          </div>
          <Separator direction="col" />
          <div className="flex flex-grow basis-0 flex-col gap-2">
            {timeList.map((time) => (
              <Radio
                group="time"
                value={time}
                checked={time === selected.time}
                onClick={() => {
                  if (selected.time === time) return;
                  setSelected({ ...selected, time: time });
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-col py-4">
          <span className="text-heading3 text-typo">선택된 일시 </span>
          {selectedEvent ? (
            <span className="text-caption1 text-success">
              {getDate(selectedEvent.runningDate) + getTime(selectedEvent.runningDate)}
            </span>
          ) : (
            <span className="text-caption1 text-error">없음 </span>
          )}
        </div>
        {
          <Button size={'middle'} color={'success'} disabled={!selectedEvent}>
            <span className={cx('text-label1', selectedEvent ? 'text-typo-display' : 'text-typo-disable')}>
              예매하기
            </span>
          </Button>
        }
      </div>
    </div>
  );
}
const MENU = [
  { title: '날짜', caption: '날짜를 선택해주세요' },
  null,
  { title: '시간', caption: '시간을 선택헤주세요' },
] as const;

interface IProgramInformationProps
  extends Pick<Program, 'actors' | 'genre' | 'place' | 'profileUrl' | 'runningTime' | 'name'> {
  isOneDay: boolean;
  startDate: string;
  lastDate: string;
}
const ProgramInformation = ({
  name,
  runningTime,
  genre,
  actors,
  place,
  profileUrl,
  isOneDay,
  startDate,
  lastDate,
}: IProgramInformationProps) => {
  return (
    <div className="flex gap-8">
      <img src={profileUrl} width={200} height={300} alt={`${name}`} />
      <div className="flex flex-grow flex-col gap-8">
        <h3 className="text-heading1 text-typo">{name}</h3>
        <div className="flex gap-8 text-display1 text-typo">
          <div className="flex flex-col gap-4">
            <div>공연 기간 : {isOneDay ? startDate : `${startDate} ~ ${lastDate}`}</div>
            <div>공연 장소 : {place}</div>
            <div>관람 시간 : {runningTime}</div>
          </div>
          <div className="flex flex-col gap-4">
            <div>장르 : {genre}</div>
            <div>출연진 : {actors}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const programData: Program = {
  id: 1,
  name: '서울의 밤: 라이브 콘서트',
  runningTime: 150,
  genre: '음악/공연',
  actors: '아이유, 지코, 박보검',
  place: '서울 올림픽 공원',
  profileUrl: 'https://picsum.photos/200/300?random=1',
  price: 120000, // 가격은 원 단위로, 예시로 12만원
  events: [
    {
      id: 1,
      runningDate: new Date('2024-12-01T14:00:00'),
    },
    {
      id: 2,
      runningDate: new Date('2024-12-01T17:00:00'),
    },
    {
      id: 3,
      runningDate: new Date('2024-12-01T20:00:00'),
    },
    {
      id: 4,
      runningDate: new Date('2024-12-01T23:00:00'),
    },
    {
      id: 5,
      runningDate: new Date('2024-12-02T14:00:00'),
    },
    {
      id: 6,
      runningDate: new Date('2024-12-02T17:00:00'),
    },
    {
      id: 7,
      runningDate: new Date('2024-12-02T20:00:00'),
    },
    {
      id: 8,
      runningDate: new Date('2024-12-02T23:00:00'),
    },
    {
      id: 9,
      runningDate: new Date('2024-12-03T14:00:00'),
    },
    {
      id: 10,
      runningDate: new Date('2024-12-03T17:00:00'),
    },
    {
      id: 11,
      runningDate: new Date('2024-12-03T20:00:00'),
    },
    {
      id: 12,
      runningDate: new Date('2024-12-03T23:00:00'),
    },
  ],
};
interface Event {
  id: number;
  name: string;
  place: string;
  runningTime: number;
  runningDate: Date;
  reservationOpenDate: Date;
  reservationCloseDate: Date;
}
interface Program {
  id: number;
  name: string;
  runningTime: number;
  genre: string;
  actors: string;
  place: string;
  profileUrl: string;
  price: number;
  events: Pick<Event, 'id' | 'runningDate'>[];
}
