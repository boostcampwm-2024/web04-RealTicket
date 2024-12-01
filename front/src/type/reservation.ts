import { SEAT_COUNT_LIST } from '@/constants/reservation.ts';

export interface Reservation {
  id: number;
  programName: string;
  runningDate: string;
  placeName: string;
  seats: string;
}

export type SeatCount = (typeof SEAT_COUNT_LIST)[number];
