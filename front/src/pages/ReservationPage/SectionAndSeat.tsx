import { useState } from 'react';
import Select from 'react-select';

import { postSeatCount } from '@/api/booking.ts';
import { postReservation } from '@/api/reservation.ts';

import useConfirm from '@/hooks/useConfirm.tsx';
import usePreventLeave from '@/hooks/usePreventLeave.tsx';

import { toast } from '@/components/Toast/index.ts';
import Button from '@/components/common/Button.tsx';
import Icon from '@/components/common/Icon.tsx';
import Loading from '@/components/common/Loading.tsx';
import Separator from '@/components/common/Separator.tsx';

import SeatMap from '@/pages/ReservationPage/SeatMap.tsx';
import SectionSelectorMap from '@/pages/ReservationPage/SectionSelectorMap';

import { getDate, getTime } from '@/utils/date.ts';
import { changeSeatCountDebounce } from '@/utils/debounce.ts';
import { padEndArray } from '@/utils/padArray.ts';

import { SEAT_COUNT_LIST } from '@/constants/reservation.ts';
import type { EventDetail, PlaceInformation, SectionCoordinate } from '@/type/index.ts';
import type { SeatCount } from '@/type/reservation.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cx } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

export interface SelectedSeat {
  sectionIndex: number;
  seatIndex: number;
  name: string;
}

interface ISectionAndSeatProps {
  seatCount: SeatCount;
  changeSeatCount: (count: SeatCount) => void;
  goNextStep: () => void;
  setReservationResult: (result: SelectedSeat[]) => void;
  event: EventDetail;
  placeInformation: PlaceInformation;
  selectSeatCount: (count: SeatCount) => void;
}

//TODO sse로 상태 받아오기, 좌석 선택 요청, 취소, mutation 커스텀 훅 필요
export default function SectionAndSeat({
  seatCount,
  event,
  placeInformation,
  setReservationResult,
  selectSeatCount,
  goNextStep,
}: ISectionAndSeatProps) {
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<SelectedSeat[]>([]);
  const [isOpenSelect, setIsOpenSelect] = useState<boolean>(false);
  const [isChangingCount, setIsChangingCount] = useState<boolean>(false);
  const { mutate: confirmReservation } = useMutation({ mutationFn: postReservation });
  const { mutate: postSeatCountMutate } = useMutation({ mutationFn: postSeatCount });
  const queryClient = useQueryClient();
  const { confirm } = useConfirm();
  usePreventLeave();

  const { layout } = placeInformation;
  const { overview, overviewHeight, overviewPoints, overviewWidth, sections } = layout;
  const { name, place, runningDate, runningTime, id: eventId } = event;

  const sectionCo = JSON.parse(overviewPoints) as SectionCoordinate[];
  const selectedSectionSeatMap =
    selectedSection !== null && sections.find((_, index) => index == selectedSection);
  const viewBoxData = `0 0 ${overviewWidth} ${overviewHeight}`;
  const isSelectionComplete = seatCount <= selectedSeats.length;
  const canViewSeatMap = selectedSection !== null && selectedSectionSeatMap;

  const SELECT_OPTION_LIST = SEAT_COUNT_LIST.map((count) => ({ value: count, label: `${count}매` }));

  return (
    <div className="flex w-full gap-4">
      <div className="flex w-[70%] flex-col gap-8 px-4 py-2">
        <div className="flex flex-col items-start">
          <h2 className="text-heading1 text-typo">{name}</h2>
        </div>
        <div className="flex justify-between">
          <div className="flex flex-col gap-4">
            <span className="text-display1 text-typo">{`공연장 : ${place.name}`}</span>
            <span className="text-display1 text-typo">{`관람 시간: ${runningTime}분`}</span>
          </div>
          <div className="flex flex-col gap-4">
            <span className="text-display1 text-typo"> {`날짜 : ${getDate(runningDate)}`}</span>
            <span className="text-display1 text-typo">{`시간 : ${getTime(runningDate)}`}</span>
          </div>
        </div>
        {selectedSection !== null && (
          <>
            <Separator direction="row" />
            <div className="flex justify-evenly">
              {SEAT_STATES.map((state) => {
                const surfaceColorClass = getColorClass(state);
                return (
                  <div key={state} className="gap-4d flex items-center gap-4 text-display1 text-typo">
                    <div className={`h-6 w-6 ${surfaceColorClass} rounded`} /> {state}
                  </div>
                );
              })}
            </div>
            <Separator direction="row" />
          </>
        )}
        {canViewSeatMap ? (
          <>
            <StageDirection />
            <div
              className={twMerge(
                cx(
                  'relative mx-auto grid auto-cols-min gap-4',
                  selectedSectionSeatMap ? `grid-cols-${selectedSectionSeatMap.colLen}` : '',
                ),
              )}>
              {isChangingCount && <Dimmed />}
              <SeatMap
                selectedSeats={selectedSeats}
                setSelectedSeats={setSelectedSeats}
                selectedSection={sections[selectedSection]}
                maxSelectCount={seatCount}
                selectedSectionIndex={selectedSection}
              />
            </div>
          </>
        ) : (
          <SectionSelectorMap
            sections={sectionCo}
            selectedSection={selectedSection}
            setSelectedSection={setSelectedSection}
            svgURL={overview}
            viewBoxData={viewBoxData}
          />
        )}
      </div>
      <Separator direction="col" />
      <div className="flex flex-col gap-6">
        <SectionSelectorMap
          className="flex-grow-0"
          sections={sectionCo}
          selectedSection={selectedSection}
          setSelectedSection={setSelectedSection}
          svgURL={overview}
          viewBoxData={viewBoxData}
        />
        <Separator direction="row" />
        <label htmlFor="seatCount" className="flex flex-col gap-4">
          <span className="text-heading2">좌석 개수</span>
          <Select
            menuIsOpen={isOpenSelect}
            defaultValue={SELECT_OPTION_LIST[seatCount - 1]}
            isSearchable={false}
            options={SELECT_OPTION_LIST}
            closeMenuOnSelect={true}
            blurInputOnSelect={true}
            onChange={(event) => {
              if (event) {
                //TODO 상태변경 너무 많다 관리 필요
                const count = event.value;
                setSelectedSeats([]);
                selectSeatCount(count);
                setIsChangingCount(true);
                toast.warning('예매 매수 변경 중입니다.\n잠시만 기다려 주세요.');
                changeSeatCountDebounce(() => {
                  postSeatCountMutate(count, {
                    onSettled: () => {
                      setIsChangingCount(false);
                    },
                  });
                });
              }
            }}
            onFocus={async () => {
              if (isOpenSelect) return;
              const isConfirm = await confirm({
                title: '예매 매수 변경',
                description: `예매 매수를 변경하면 현재 선택한 좌석이 모두 취소됩니다.\n계속 진행하시겠습니까? `,
                buttons: {
                  ok: {
                    title: '변경하기',
                    color: 'error',
                  },
                  cancel: {
                    title: '취소',
                  },
                },
              });
              if (isConfirm) {
                setIsOpenSelect(true);
                changeSeatCountDebounce(() => {});
              }
            }}
            onBlur={() => {
              setIsOpenSelect(false);
            }}
          />
        </label>

        <Separator direction="row" />
        <div className="flex flex-col gap-4">
          <h3 className="text-heading2">선택한 좌석</h3>
          <div className="relative flex flex-col gap-2">
            {isChangingCount && <Loading className="h-full bg-black/20" />}
            {padEndArray(selectedSeats, seatCount, null).map((item, index) => {
              if (item == null)
                return (
                  <div
                    key={index}
                    className="flex w-full items-center gap-2 rounded border border-surface px-4 py-2">
                    <Icon iconName="Square" />
                    <span className="text-display1 text-typo-sub">좌석을 선택해주세요</span>
                  </div>
                );
              else
                return (
                  <div
                    key={index}
                    className="flex w-full items-center gap-2 rounded border border-success px-4 py-2">
                    <Icon iconName="CheckSquare" color="success" />
                    <span className="text-display1 text-typo">{item.name}</span>
                  </div>
                );
            })}
          </div>
        </div>
        <Separator direction="row" />
        <Button
          disabled={!isSelectionComplete}
          onClick={() => {
            confirmReservation(
              {
                eventId,
                seats: selectedSeats.map((seat) => ({
                  sectionIndex: seat.sectionIndex,
                  seatIndex: seat.seatIndex,
                })),
              },
              {
                onSuccess: () => {
                  setReservationResult(selectedSeats);
                  queryClient.refetchQueries({ queryKey: ['reservation'] });
                  queryClient.invalidateQueries({ queryKey: ['event'] });
                  goNextStep();
                },
              },
            );
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

const Dimmed = () => {
  return <div className="absolute left-0 top-0 h-full w-full cursor-not-allowed bg-transparent"></div>;
};

const StageDirection = () => {
  return (
    <div className="text-center">
      <span className="cursor-default bg-surface-sub p-2 px-8 text-heading2 text-typo-display">
        무대 방향(stage)
      </span>
    </div>
  );
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
