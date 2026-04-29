import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Select from 'react-select';

import { BASE_URL } from '@/api/axios.ts';
import { patchSection, postSeatCount } from '@/api/booking.ts';
import { postReservation } from '@/api/reservation.ts';

import useConfirm from '@/hooks/useConfirm.tsx';
import usePreventLeave from '@/hooks/usePreventLeave.tsx';
import useSSE from '@/hooks/useSSE.tsx';

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

import { API } from '@/constants/index.ts';
import { SEAT_COUNT_LIST } from '@/constants/reservation.ts';
import type { EventDetail, PlaceInformation, SectionCoordinate } from '@/type/index.ts';
import type { SeatCount } from '@/type/reservation.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

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
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [seatStatus, setSeatStatus] = useState<number[] | null>(null);
  const prevSectionRef = useRef<number | null>(null);
  const prevSeatStatusRef = useRef<number[] | null>(null);
  const { eventId } = useParams();

  // per D-01: SectionAndSeat 마운트 시 연결 시작 (init 풀)
  // per FE-02: 단일 섹션 타입으로 수신
  // Phase 4: occupiedSeats optional 필드 추가 (per D-01)
  // D-03 FE: selectedSection 기반으로 sseURL 동적 생성 — 섹션 변경 시 useSSE useEffect cleanup이 자동 close+open
  const sseURL =
    selectedSection !== null
      ? `${BASE_URL}${API.BOOKING.GET_SEATS_SSE(Number(eventId), selectedSection)}`
      : `${BASE_URL}${API.BOOKING.GET_SEATS_SSE(Number(eventId))}`;
  const { data: sseData } = useSSE<{
    sectionIndex: number;
    seatStatus: number[];
    occupiedSeats?: [number, number][];
  }>({ sseURL });

  const { mutate: confirmReservation } = useMutation({ mutationFn: postReservation });
  const { mutate: postSeatCountMutate } = useMutation({ mutationFn: postSeatCount });

  // per D-01, D-03, D-04, D-05
  const { mutate: patchSectionMutate } = useMutation({
    mutationFn: (sectionIndex: number) => patchSection({ sectionIndex }),
    onSuccess: (data) => {
      setSeatStatus(data.seatStatus); // FE-03: 즉시 반영
    },
    onError: () => {
      toast.error('섹션 전환에 실패했습니다');
      setSelectedSection(prevSectionRef.current); // D-04: 롤백
      setSeatStatus(prevSeatStatusRef.current); // D-04: seatStatus 복원
    },
    throwOnError: false,
  });

  const queryClient = useQueryClient();
  const { confirm } = useConfirm();
  usePreventLeave();

  // FE-02: SSE 브로드캐스트 수신 시 seatStatus 갱신
  // Phase 4: occupiedSeats 수신 시 selectedSeats 서버 데이터로 동기화 (per D-04)
  useEffect(() => {
    if (!sseData) return;
    if (sseData.occupiedSeats !== undefined) {
      // Phase 4: 서버 bookedSeats → selectedSeats 동기화 (per D-04)
      const restored = sseData.occupiedSeats.map(([sectionIdx, seatIndex]) => ({
        sectionIndex: sectionIdx,
        seatIndex,
        name: deriveSeatName(placeInformation, sectionIdx, seatIndex),
      }));
      setSelectedSeats(restored);
    } else if (sseData.sectionIndex >= 0) {
      // 기존: 좌석 상태 브로드캐스트 업데이트
      setSeatStatus(sseData.seatStatus);
    }
  }, [sseData]);

  const { layout } = placeInformation;
  const { overview, overviewHeight, overviewPoints, overviewWidth, sections } = layout;
  const { name, place, runningDate, runningTime, id: eventId2 } = event;

  const sectionCo = JSON.parse(overviewPoints) as SectionCoordinate[];
  const selectedSectionSeatMap =
    selectedSection !== null && sections.find((_, index) => index == selectedSection);
  const viewBoxData = `0 0 ${overviewWidth} ${overviewHeight}`;
  const isSelectionComplete = seatCount <= selectedSeats.length;
  const canViewSeatMap = selectedSection !== null && selectedSectionSeatMap;

  const SELECT_OPTION_LIST = SEAT_COUNT_LIST.map((count) => ({ value: count, label: `${count}매` }));

  // 좌석 수에 따른 자동 크기 계산
  const calculateSeatSize = (colLen: number) => {
    if (colLen <= 15) return 28; // 기본 크기
    if (colLen <= 25) return 24; // 중간 크기
    if (colLen <= 35) return 20; // 작은 크기
    return 16; // 최소 크기
  };

  // 좌석 규모에 따른 초기 줌 레벨 계산
  const calculateInitialZoom = (colLen: number, rowLen: number) => {
    const maxDimension = Math.max(colLen, rowLen);
    if (maxDimension <= 30) return 1.0; // 100% - 소규모
    if (maxDimension <= 40) return 0.75; // 75% - 중간 규모
    return 0.5; // 50% - 대형
  };

  const seatSize = selectedSectionSeatMap ? calculateSeatSize(selectedSectionSeatMap.colLen) : 28;

  const finalSeatSize = seatSize * zoomLevel;

  // selectedSection이 변경될 때마다 적절한 초기 줌 레벨 설정
  useEffect(() => {
    if (selectedSectionSeatMap && typeof selectedSectionSeatMap === 'object') {
      const rowLen = selectedSectionSeatMap.seats.length / selectedSectionSeatMap.colLen;
      const initialZoom = calculateInitialZoom(selectedSectionSeatMap.colLen, rowLen);
      setZoomLevel(initialZoom);
    }
  }, [selectedSection]);

  // per D-04: prevSection 클릭 시점에 캡처 — stale closure 방지를 위해 useRef 사용
  const handleSectionClick = (newSectionIndex: number) => {
    prevSectionRef.current = selectedSection; // 롤백 대상 저장
    prevSeatStatusRef.current = seatStatus; // D-04: seatStatus 롤백 대상 저장
    setSelectedSection(newSectionIndex); // 낙관적 UI (선택 즉시 반영)
    setSeatStatus(null); // 이전 섹션 좌석 데이터 클리어
    patchSectionMutate(newSectionIndex);
  };

  return (
    <div className="flex w-full gap-4">
      {/* 왼쪽 영역 - 너비 제한 강화 */}
      <div className="flex w-[70%] min-w-0 flex-col gap-8 px-4 py-2">
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

            {/* 줌 컨트롤 */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
                className="flex h-8 w-8 items-center justify-center rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                disabled={zoomLevel <= 0.5}>
                <span className="text-lg font-bold">-</span>
              </button>
              <span className="min-w-[60px] text-center text-sm font-medium">
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))}
                className="flex h-8 w-8 items-center justify-center rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
                disabled={zoomLevel >= 2}>
                <span className="text-lg font-bold">+</span>
              </button>
              <button
                onClick={() => {
                  if (selectedSectionSeatMap) {
                    const rowLen = selectedSectionSeatMap.seats.length / selectedSectionSeatMap.colLen;
                    const initialZoom = calculateInitialZoom(selectedSectionSeatMap.colLen, rowLen);
                    setZoomLevel(initialZoom);
                  } else {
                    setZoomLevel(1);
                  }
                }}
                className="ml-2 rounded bg-blue-500 px-3 py-1 text-xs text-white hover:bg-blue-600">
                자동
              </button>
            </div>

            {/* 핵심: 부모 너비를 절대 넘지 않는 스크롤 컨테이너 */}
            <div className="w-full overflow-hidden">
              <div className="mx-auto w-full overflow-auto p-4" style={{ height: '600px' }}>
                {/* 배치도 정보 표시 */}
                <div className="mb-4 text-center">
                  <div className="inline-flex items-center gap-4 rounded bg-white px-4 py-2 shadow-sm">
                    <span className="text-sm text-gray-600">{selectedSectionSeatMap?.name}구역</span>
                    <span className="text-xs text-gray-500">
                      {selectedSectionSeatMap?.colLen}열 ×{' '}
                      {Math.ceil(
                        selectedSectionSeatMap?.seats.filter((s) => s === 1).length /
                          selectedSectionSeatMap?.colLen,
                      )}
                      행
                    </span>
                  </div>
                </div>

                {/* 성능 최적화: transform 대신 직접 크기 변경 */}
                <div
                  className="relative grid gap-1"
                  style={{
                    gridTemplateColumns: selectedSectionSeatMap
                      ? `repeat(${selectedSectionSeatMap.colLen}, ${finalSeatSize}px)`
                      : undefined,
                    justifyContent: 'center',
                    width: 'fit-content',
                    margin: '0 auto',
                  }}>
                  {isChangingCount && <Dimmed />}
                  {seatStatus !== null ? (
                    <SeatMap
                      selectedSeats={selectedSeats}
                      setSelectedSeats={setSelectedSeats}
                      selectedSection={sections[selectedSection]}
                      maxSelectCount={seatCount}
                      selectedSectionIndex={selectedSection}
                      seatStatus={seatStatus}
                      seatSize={finalSeatSize}
                    />
                  ) : (
                    <Loading />
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <SectionSelectorMap
            sections={sectionCo}
            selectedSection={selectedSection}
            setSelectedSection={handleSectionClick}
            svgURL={overview}
            viewBoxData={viewBoxData}
          />
        )}
      </div>
      <Separator direction="col" />
      <div className="flex w-[30%] min-w-0 flex-col gap-6">
        <SectionSelectorMap
          className="flex-grow-0"
          sections={sectionCo}
          selectedSection={selectedSection}
          setSelectedSection={handleSectionClick}
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
                eventId: eventId2,
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

// Phase 4: 서버 bookedSeats [sectionIndex, seatIndex] → SelectedSeat.name 복원 (per D-05)
// SeatMap.tsx renderSeatMap의 좌석명 생성 로직과 동일하게 구현 (canonical reference)
export function deriveSeatName(
  placeInformation: PlaceInformation,
  sectionIndex: number,
  seatIndex: number,
): string {
  const section = placeInformation.layout.sections[sectionIndex];
  if (!section) return `${sectionIndex}-${seatIndex}`;

  const { name, seats, colLen } = section;
  let columnCount = 1;
  for (let i = 0; i <= seatIndex; i++) {
    const isNewLine = i % colLen === 0;
    if (isNewLine) columnCount = 1;
    if (i === seatIndex) {
      const rowsCount = Math.floor(i / colLen) + 1;
      return `${name}구역 ${rowsCount}행 ${columnCount}열`;
    }
    if (seats[i]) columnCount++;
  }
  return `${sectionIndex}-${seatIndex}`;
}

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
