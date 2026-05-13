import { useParams } from 'react-router-dom';

import type { PostSeatData } from '@/api/booking.ts';
import { postSeat } from '@/api/booking.ts';

import { toast } from '@/components/Toast/index.ts';

import type { SelectedSeat } from '@/pages/ReservationPage/SectionAndSeat.tsx';

import type { Section } from '@/type/index.ts';
import { useMutation, useMutationState } from '@tanstack/react-query';

interface SeatMapProps {
  selectedSection: Section;
  selectedSectionIndex: number;
  setSelectedSeats: (seats: SelectedSeat[]) => void;
  maxSelectCount: number;
  selectedSeats: SelectedSeat[];
  seatStatus: number[]; // SectionAndSeat에서 전달
  seatSize?: number; // 좌석 크기 prop 추가
}

export default function SeatMap({
  selectedSection,
  selectedSectionIndex,
  setSelectedSeats,
  maxSelectCount,
  selectedSeats,
  seatStatus,
  seatSize = 24, // 기본값
}: SeatMapProps) {
  const { eventId } = useParams();
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

  return (
    <>
      {renderSeatMap(
        selectedSection,
        selectedSectionIndex,
        seatStatus,
        setSelectedSeats,
        maxSelectCount,
        selectedSeats,
        pickSeat,
        Number(eventId!),
        reservingList,
        seatSize,
      )}
    </>
  );
}

const renderSeatMap = (
  selectedSection: Section,
  selectedSectionIndex: number,
  seatStatus: number[],
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
  seatSize: number, // 좌석 크기 매개변수 추가
) => {
  let columnCount = 1;
  const { name, seats, colLen } = selectedSection;

  return seats.map((seat, index) => {
    const rowsCount = Math.floor(index / colLen) + 1;
    const isNewLine = index % colLen === 0;
    if (isNewLine) columnCount = 1;
    const seatName = seat === 1 ? `${name}구역 ${rowsCount}행 ${columnCount}열` : null;
    const isMine = seatName && selectedSeats.some((selected) => selected.name == seatName);

    const isReserving = reservingList.some(
      (reserve) => reserve.seatIndex === index && reserve.sectionIndex === selectedSectionIndex,
    );
    const isOthers = seatStatus[index] === 0;

    const stateClass =
      seat === 0
        ? 'bg-transparent pointer-events-none'
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
        key={`${seatName}${index}`}
        className={`${stateClass} rounded-sm`}
        style={{
          width: `${seatSize}px`, // 동적 크기
          height: `${seatSize}px`, // 동적 크기
          flexShrink: 0,
          minWidth: `${seatSize}px`, // 최소 크기 보장
          minHeight: `${seatSize}px`, // 최소 크기 보장
        }}
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

const PICK_SEAT_MUTATION_KEY_LIST = ['seat'];
