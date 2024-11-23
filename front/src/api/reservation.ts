import { apiClient } from '@/api/axios.ts';

export const getReservation = () => apiClient.get('/reservation').then((res) => res.data);
export const deleteReservation = (id: number) => apiClient.delete(`/reservation/${id}`);
