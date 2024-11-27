import Button from '@/components/common/Button.tsx';
import Icon from '@/components/common/Icon.tsx';

import { getDate, getTime } from '@/utils/date.ts';

import type { Reservation } from '@/type/reservation.ts';

interface ReservationCardProps extends Reservation {
  handleDeleteReservation: () => void;
  isDeleting: boolean;
}

export default function ReservationCard({
  programName,
  runningDate,
  placeName,
  seats,
  isDeleting,
  handleDeleteReservation,
}: ReservationCardProps) {
  return (
    <div className="relative w-full rounded-xl border border-surface-cardBorder bg-surface-card p-6">
      {isDeleting && (
        <div className="absolute left-0 top-0 z-50 flex h-full w-full items-center justify-center bg-surface opacity-30">
          <div className="flex flex-col items-center gap-4">
            <Icon iconName="Trash" color={'warning'} className="h-16 w-16 animate-ping" />
            <span className="text-caption1 text-warning">deleting...</span>
          </div>
        </div>
      )}
      <div className="flex max-w-[calc(100%-64px)] flex-col gap-6 text-left">
        <h3 className="truncate text-display1">{programName}</h3>
        <div className="">
          <div className="truncate text-display1">{getDate(runningDate) + getTime(runningDate)}</div>
          <div className="truncate text-display1 hover:overflow-visible hover:text-clip">{`공연장 : ${placeName}`}</div>
        </div>
        <div>
          <span className="truncate text-display1">좌석</span>
          <ul>
            {seats.split(',').map((seat) => (
              <li>{seat}</li>
            ))}
          </ul>
        </div>
      </div>
      <Button
        className="absolute right-0 top-0 mr-6 mt-6"
        intent={'outline'}
        size={'fit'}
        color={'error'}
        onClick={handleDeleteReservation}>
        <Icon iconName="Trash" color={'error'} />
      </Button>
    </div>
  );
}
