import { useState } from 'react';

import Button from '@/components/common/Button.tsx';
import Separator from '@/components/common/Separator.tsx';

import SectionSelectorMap from '@/pages/ReservationPage/SectionSelectorMap';

import { getDate, getTime } from '@/utils/date.ts';

import { cx } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

interface ISectionAndSeatProps {
  seatCount: 1 | 2 | 3 | 4;
  goNextStep: () => void;
  setReservationResult: (result: string[]) => void;
}
export default function SectionAndSeat({
  seatCount,
  goNextStep,
  setReservationResult,
}: ISectionAndSeatProps) {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  //TODO 길이 모음 필요

  const selectedSectionSeatMap =
    selectedSection && initialSeatMap.find((section) => section.name == selectedSection);
  const seatStatus = seatStatusMap.find((section) => section.name === selectedSection);

  const { overviewHeight, overviewSvgUrl, overviewWidth, sections } = placeInfo;
  const { title, actors, place, runningDate, runningTime } = event;
  const viewBoxData = `0 0 ${overviewWidth} ${overviewHeight}`;
  const isSelectionComplete = seatCount <= selectedSeats.length;

  const seatsGridClass =
    selectedSectionSeatMap && `grid-cols-[repeat(${selectedSectionSeatMap.colLength},min-content)]`;
  //TODO 폰트 크기 구하기 필요
  return (
    <div className="flex w-full gap-4">
      <div className="flex w-[70%] flex-col gap-8 px-4 py-2">
        <div className="flex flex-col items-start">
          <h2 className="text-heading1 text-typo">{title}</h2>
          <span className="text-heading3 text-typo-sub">{actors}</span>
        </div>
        <div className="flex justify-between">
          <div className="flex flex-col gap-4">
            <span className="text-display1 text-typo">{`공연장 : ${place}`}</span>
            <span className="text-display1 text-typo">{`관람 시간: ${runningTime}`}</span>
          </div>
          <div className="flex flex-col gap-4">
            <span className="text-display1 text-typo"> {`날짜 : ${getDate(runningDate)}`}</span>
            <span className="text-display1 text-typo">{`시간 : ${getTime(runningDate)}`}</span>
          </div>
        </div>
        {selectedSection && (
          <>
            <Separator direction="row" />
            <div className="flex justify-evenly">
              {SEAT_STATES.map((state) => {
                const surfaceColorClass = getColorClass(state);
                return (
                  <div className="gap-4d flex items-center gap-4 text-display1 text-typo">
                    <div className={`h-6 w-6 ${surfaceColorClass} rounded`} /> {state}
                  </div>
                );
              })}
            </div>
            <Separator direction="row" />
          </>
        )}
        {selectedSection && selectedSectionSeatMap ? (
          <div className={twMerge(cx('mx-auto grid auto-cols-min gap-4', seatsGridClass))}>
            {/* data-set에 초기 seat 그릴 떄 설정하기  */}
            {renderSeatMap(
              selectedSectionSeatMap,
              seatStatus!.seats,
              setSelectedSeats,
              seatCount,
              selectedSeats,
            )}
          </div>
        ) : (
          <SectionSelectorMap
            sections={sections}
            selectedSection={selectedSection}
            setSelectedSection={setSelectedSection}
            svgURL={overviewSvgUrl}
            viewBoxData={viewBoxData}
          />
        )}
      </div>
      <Separator direction="col" />
      <div className="flex flex-col gap-6">
        <SectionSelectorMap
          className="flex-grow-0"
          sections={sections}
          selectedSection={selectedSection}
          setSelectedSection={setSelectedSection}
          svgURL={overviewSvgUrl}
          viewBoxData={viewBoxData}
        />
        <Separator direction="row" />
        <div>
          <h3>선택한 좌석</h3>
          <div>
            {selectedSeats.map((seat) => (
              <span>{seat}</span>
            ))}
          </div>
        </div>

        <Separator direction="row" />
        <Button
          disabled={!isSelectionComplete}
          onClick={() => {
            setReservationResult(selectedSeats);
            goNextStep();
          }}>
          {isSelectionComplete ? (
            <span className="text-label1 text-typo-display">예매하기</span>
          ) : (
            <span className="text-label1 text-typo-disable">좌석을 모두 선택해주세요</span>
          )}
        </Button>
      </div>
    </div>
  );
}
//seatMap
const renderSeatMap = (
  selectedSection: {
    id: number;
    name: string;
    seats: boolean[];
    colLength: number;
  },
  seatStatus: boolean[],
  setSelectedSeats: (seats: string[]) => void,
  maxSelectCount: number,
  selectedSeats: string[],
) => {
  let columnCount = 1;
  const { name, seats, colLength } = selectedSection;

  return seats.map((seat, index) => {
    const rowsCount = Math.floor(index / colLength) + 1;
    const isNewLine = index % colLength === 0;
    if (isNewLine) columnCount = 1;
    const seatName = seat ? `${name}구역 ${rowsCount}행 ${columnCount}열` : null;
    const isMine = seatName ? selectedSeats.includes(seatName) : false;

    const isOthers = !seatStatus[index];
    //TODO 삼항 연산자 제거
    const stateClass = !seat
      ? 'bg-transparent  pointer-events-none'
      : isMine
        ? 'bg-success cursor-pointer'
        : isOthers
          ? `bg-surface-sub pointer-events-none`
          : 'bg-primary cursor-pointer';
    if (seat) columnCount++;
    return (
      <div
        className={`h-6 w-6 ${stateClass}`}
        data-name={seatName}
        onClick={() => {
          const selectedCount = selectedSeats.length;
          if (isMine) {
            const nextSelectedSeats = selectedSeats.filter((seat) => seat !== seatName);
            setSelectedSeats(nextSelectedSeats);
            return;
          }
          if (maxSelectCount <= selectedCount) return;
          setSelectedSeats([...selectedSeats, seatName!]);
        }}
      />
    );
  });
};

const SEAT_STATES = ['선택 가능', '선택 중', '선택 완료', '선택 불가'];
const getColorClass = (state: string) => {
  switch (state) {
    case '선택 가능':
      return 'bg-primary';
    case '선택 중':
      return 'bg-warning';
    case '선택 완료':
      return 'bg-success';
    case '선택 불가':
      return 'bg-surface-sub';
  }
};

/*
초기 좌석 값이 false 투명
선점된 좌석 disabled
가능한 좌석 primary 
 */

const SECTIONS = [
  {
    id: 'A',
    points: [
      [447.121, 869.114],
      [447.121 + 1118.19, 869.114],
      [447.121 + 1118.19, 869.114 + 1822.87],
      [447.121, 869.114 + 1822.87],
    ],
  },
  {
    id: 'B',
    points: [
      [2662.6, 869.114],
      [2662.6 + 1118.11, 869.114],
      [2662.6 + 1118.11, 869.114 + 1822.9],
      [2662.6, 869.114 + 1822.9],
    ],
  },
];
const placeInfo = {
  id: 1,
  name: '공연장 이름',
  overviewSvgUrl: '/public/images/stageSimple.svg', //백그라운드가 들어갈 이미지 URL
  overviewHeight: 3019,
  overviewWidth: 4394,
  sections: SECTIONS,
};

const event: Event = {
  id: 1,
  title: "IU 2024 콘서트 'I and You'",
  place: '서울 올림픽공원 체조경기장',
  runningTime: 120, // 2시간
  price: 124000,
  runningDate: new Date('2024-12-10T19:00:00'),
  reservationOpenDate: new Date('2024-11-15T10:00:00'),
  reservationCloseDate: new Date('2024-12-10T18:00:00'),
  actors: '아이유 (IU)',
};
interface Event {
  id: number;
  title: string;
  place: string;
  price: number;
  runningTime: number;
  runningDate: Date;
  reservationOpenDate: Date;
  reservationCloseDate: Date;
  actors: string;
}

const initialSeatMap = [
  {
    id: 1,
    name: 'A',
    seats: [
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ],
    colLength: 5,
  },
  {
    id: 2,
    name: 'B',
    seats: [
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
    ],
    colLength: 5,
  },
];

const seatStatusMap = [
  {
    id: 1,
    name: 'A',
    seats: [
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
    ],
    colLength: 5,
  },
  {
    id: 2,
    name: 'B',
    seats: [
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      false,
      true,
      false,
      true,
      true,
      false,
      true,
      true,
      true,
      false,
      false,
      true,
      true,
    ],
    colLength: 5,
  },
];
