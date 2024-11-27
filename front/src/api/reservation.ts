import { apiClient } from '@/api/axios.ts';

import { API } from '@/constants/index.ts';

export const getReservation = () => apiClient.get(API.RESERVATION.GET_RESERVATION).then((res) => res.data);
export const deleteReservation = (id: number) => apiClient.delete(API.RESERVATION.DELETE_RESERVATION(id));
export const postReservation = (data: PostReservationData) =>
  apiClient.post(API.RESERVATION.POST_RESERVATION, data);

export interface PostReservationData {
  eventId: number;
  seats: SeatInfo[];
}

interface SeatInfo {
  sectionIndex: number;
  seatIndex: number;
}
