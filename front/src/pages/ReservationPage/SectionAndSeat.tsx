import { useEffect, useRef, useState } from 'react';

import { BASE_URL } from '@/api/axios.ts';
import { PostSeatData, postSeat } from '@/api/booking.ts';
import { postReservation } from '@/api/reservation.ts';

import { toast } from '@/components/Toast/index.ts';
import Button from '@/components/common/Button.tsx';
import Icon from '@/components/common/Icon.tsx';
import Separator from '@/components/common/Separator.tsx';

import SectionSelectorMap from '@/pages/ReservationPage/SectionSelectorMap';

import { getDate, getTime } from '@/utils/date.ts';
import { padEndArray } from '@/utils/padArray.ts';

import { API } from '@/constants/index.ts';
import type { EventDetail, PlaceInformation, Section, SectionCoordinate } from '@/type/index.ts';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { cx } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

export interface SelectedSeat {
  sectionIndex: number;
  seatIndex: number;
  name: string;
}

interface ISectionAndSeatProps {
  seatCount: 1 | 2 | 3 | 4;
  goNextStep: () => void;
  setReservationResult: (result: SelectedSeat[]) => void;
  event: EventDetail;
  placeInformation: PlaceInformation;
}

//TODO sse로 상태 받아오기, 좌석 선택 요청, 취소, mutation 커스텀 훅 필요
export default function SectionAndSeat({
  seatCount,
  goNextStep,
  event,
  setReservationResult,
  placeInformation,
}: ISectionAndSeatProps) {
  const [selectedSection, setSelectedSection] = useState<number | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<SelectedSeat[]>([]);
  const [seatStatusList, setSeatStatusList] = useState<boolean[][]>([]);
  const eventSourceRef = useRef<null | EventSource>(null);
  const { mutate: pickSeat } = useMutation({
    mutationFn: postSeat,
    mutationKey: PICK_SEAT_MUTATION_KEY_LIST,
    onError: (_, data) => {
      const { seatIndex, sectionIndex } = data;
      const filtered = selectedSeats.filter(
        (seat) => seat.seatIndex !== seatIndex || seat.sectionIndex !== sectionIndex,
      );
      setSelectedSeats([...filtered]);
      toast.error('좌석 선택/취소에 실패했습니다');
    },
    throwOnError: false,
  });
  const { mutate: confirmReservation } = useMutation({ mutationFn: postReservation });

  const reservingList = useMutationState<PostSeatData>({
    filters: {
      mutationKey: PICK_SEAT_MUTATION_KEY_LIST,
      status: 'pending',
      predicate: (mutation) => {
        return mutation.state.variables.expectedStatus === 'reserved';
      },
    },
    select: (mutation) => mutation.state.variables as PostSeatData,
  });
  const queryClient = useQueryClient();
  //TODO 길이 모음 필요 , 상태 관리 필용, 상태 reducer로 변경 필요, pending 중인 state 추출 필요
  const { layout } = placeInformation;
  const { overview, overviewHeight, overviewPoints, overviewWidth, sections } = layout;
  const { name, place, runningDate, runningTime, id: eventId } = event;
  const sectionCo = JSON.parse(overviewPoints) as SectionCoordinate[];
  const selectedSectionSeatMap =
    selectedSection !== null && sections.find((_, index) => index == selectedSection);

  const viewBoxData = `0 0 ${overviewWidth} ${overviewHeight}`;
  const isSelectionComplete = seatCount <= selectedSeats.length;
  const canViewSeatMap = selectedSection !== null && selectedSectionSeatMap && seatStatusList.length !== 0;
  //TODO 커스텀 훅으로 변경
  useEffect(() => {
    if (eventSourceRef.current === null) {
      eventSourceRef.current = new EventSource(`${BASE_URL}${API.BOOKING.GET_SEATS_SSE(eventId)}`, {
        withCredentials: true,
      });
      eventSourceRef.current.onmessage = (event) => {
        const { seatStatus } = JSON.parse(event.data);
        if (seatStatus) {
          setSeatStatusList(seatStatus);
        }
      };
    }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [eventId]);

  //TODO 폰트 크기 구하기 필요, 레이아웃 반복문으로 만들기
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
          <div
            className={twMerge(
              cx(
                'mx-auto grid auto-cols-min gap-4',
                selectedSectionSeatMap ? `grid-cols-${selectedSectionSeatMap.colLen}` : '',
              ),
            )}>
            {renderSeatMap(
              selectedSectionSeatMap,
              selectedSection,
              seatStatusList[selectedSection],
              setSelectedSeats,
              seatCount,
              selectedSeats,
              pickSeat,
              eventId,
              reservingList,
            )}
          </div>
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
        <div className="flex flex-col gap-4">
          <h3 className="text-heading2">선택한 좌석</h3>
          <div className="flex flex-col gap-2">
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
//TODO 컴포넌트로 변경
const renderSeatMap = (
  selectedSection: Section,
  selectedSectionIndex: number,
  seatStatus: boolean[],
  setSelectedSeats: (seats: SelectedSeat[]) => void,
  maxSelectCount: number,
  selectedSeats: SelectedSeat[],
  pickSeat: (
    data: PostSeatData,
    mutateOption?: {
      onSuccess?: () => void;
      onError?: () => void;
    },
  ) => void,
  eventId: number,
  reservingList: PostSeatData[],
) => {
  let columnCount = 1;
  const { name, seats, colLen } = selectedSection;

  return seats.map((seat, index) => {
    const rowsCount = Math.floor(index / colLen) + 1;
    const isNewLine = index % colLen === 0;
    if (isNewLine) columnCount = 1;
    const seatName = seat ? `${name}구역 ${rowsCount}행 ${columnCount}열` : null;
    const isMine = seatName && selectedSeats.some((selected) => selected.name == seatName);

    const isReserving = reservingList.some(
      (reserve) => reserve.seatIndex === index && reserve.sectionIndex === selectedSectionIndex,
    );
    const isOthers = !seatStatus[index];
    //TODO 삼항 연산자 제거
    const stateClass = !seat
      ? 'bg-transparent  pointer-events-none'
      : isReserving
        ? 'bg-warning pointer-events-none'
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
            const filtered = selectedSeats.filter((seat) => seatName !== seat.name);
            pickSeat(
              {
                sectionIndex: selectedSectionIndex,
                seatIndex: index,
                expectedStatus: 'deleted',
                eventId,
              },
              {
                onSuccess: () => {
                  toast.warning(`${seatName!} 좌석을 취소했습니다`);
                },
              },
            );
            setSelectedSeats(filtered);
            return;
          }

          if (maxSelectCount <= selectedCount) return;
          pickSeat(
            {
              sectionIndex: selectedSectionIndex,
              seatIndex: index,
              expectedStatus: 'reserved',
              eventId,
            },
            {
              onSuccess: () => {
                toast.success(`${seatName!} 좌석 선택에\n성공했습니다`);
              },
            },
          );
          setSelectedSeats([
            ...selectedSeats,
            { seatIndex: index, sectionIndex: selectedSectionIndex, name: seatName! },
          ]);
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

const PICK_SEAT_MUTATION_KEY_LIST = ['seat'];
