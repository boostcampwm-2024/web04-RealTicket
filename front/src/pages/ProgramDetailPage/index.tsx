import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { CustomError } from '@/api/axios.ts';
import { getProgramsDetail } from '@/api/program.ts';

import Button from '@/components/common/Button.tsx';
import Radio from '@/components/common/Radio.tsx';
import Separator from '@/components/common/Separator';

import ProgramInformation from '@/pages/ProgramDetailPage/ProgramInformation.tsx';

import { getDate, getDay, getTime } from '@/utils/date.ts';

import { ProgramDetail } from '@/type/index.ts';
import { useSuspenseQuery } from '@tanstack/react-query';
import { cx } from 'class-variance-authority';

//TODO 페이지 계층 컴포넌트 분리, 날짜 정렬
export default function ProgramDetailPage() {
  const { programId } = useParams(); //초기 데이터 호출용
  const navigate = useNavigate();
  const { data: programDetail } = useSuspenseQuery<ProgramDetail, CustomError>({
    queryKey: ['program/1'],
    queryFn: getProgramsDetail(Number(programId)),
  });

  const { events } = programDetail;
  const [selected, setSelected] = useState<{ date: null | string; time: null | string }>({
    date: null,
    time: null,
  });

  const dateList = [...new Set(events.map((event) => new Date(event.runningDate).toDateString()))];
  const startDate = dateList[0];
  const lastDate = dateList[dateList.length - 1];
  const isOneDay = startDate === lastDate;

  const filteredDateEvents = events.filter((event) => {
    const date = new Date(event.runningDate).toDateString();

    return date === selected.date;
  });
  const timeList = [...new Set(filteredDateEvents.map((event) => getTime(event.runningDate)))];
  const selectedEvent = filteredDateEvents.find((event) => getTime(event.runningDate) === selected.time);
  const goWaitingPage = () => {
    navigate(`/events/${selectedEvent?.id}/waiting`);
  };
  return (
    <div className="flex flex-col gap-8">
      <ProgramInformation {...programDetail} lastDate={lastDate} startDate={startDate} isOneDay={isOneDay} />
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
                value={getDate(date)}
                subText={getDay(date)}
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
        <Button size={'middle'} color={'success'} disabled={!selectedEvent} onClick={goWaitingPage}>
          <span className={cx('text-label1', selectedEvent ? 'text-typo-display' : 'text-typo-disable')}>
            예매하기
          </span>
        </Button>
      </div>
    </div>
  );
}

const MENU = [
  { title: '날짜', caption: '날짜를 선택해주세요' },
  null,
  { title: '시간', caption: '시간을 선택헤주세요' },
] as const;
