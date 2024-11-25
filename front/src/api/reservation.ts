import { apiClient } from '@/api/axios.ts';

import { API } from '@/constants/index.ts';

export const getReservation = () => apiClient.get(API.RESERVATION.GET_RESERVATION).then((res) => res.data);
export const deleteReservation = (id: number) => apiClient.delete(API.RESERVATION.DELETE_RESERVATION(id));
