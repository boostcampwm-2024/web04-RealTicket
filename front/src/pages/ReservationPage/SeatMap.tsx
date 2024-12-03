import { useParams } from 'react-router-dom';

import { BASE_URL } from '@/api/axios.ts';
import type { PostSeatData } from '@/api/booking.ts';
import { postSeat } from '@/api/booking.ts';

import useSSE from '@/hooks/useSSE.tsx';

import { toast } from '@/components/Toast/index.ts';
import Loading from '@/components/common/Loading.tsx';

import type { SelectedSeat } from '@/pages/ReservationPage/SectionAndSeat.tsx';

import { API } from '@/constants/index.ts';
import type { Section } from '@/type/index.ts';
import { useMutation, useMutationState } from '@tanstack/react-query';

interface SeatMapProps {
  selectedSection: Section;
  selectedSectionIndex: number;
  setSelectedSeats: (seats: SelectedSeat[]) => void;
  maxSelectCount: number;
  selectedSeats: SelectedSeat[];
}

export default function SeatMap({
  selectedSection,
  selectedSectionIndex,
  setSelectedSeats,
  maxSelectCount,
  selectedSeats,
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
  const { data, isLoading } = useSSE<{ seatStatus: boolean[][] }>({
    sseURL: `${BASE_URL}${API.BOOKING.GET_SEATS_SSE(Number(eventId))}`,
  });

  const seatStatusList = data ? data.seatStatus : null;
  const selectedSeatStatus = seatStatusList ? seatStatusList[selectedSectionIndex] : null;
  const canRender = isLoading === false && seatStatusList && seatStatusList.length !== 0;

  return (
    <>
      {canRender ? (
        renderSeatMap(
          selectedSection,
          selectedSectionIndex,
          selectedSeatStatus!,
          setSelectedSeats,
          maxSelectCount,
          selectedSeats,
          pickSeat,
          Number(eventId!),
          reservingList,
        )
      ) : (
        <Loading />
      )}
    </>
  );
}

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
        key={`${seatName}${index}`}
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

const PICK_SEAT_MUTATION_KEY_LIST = ['seat'];
