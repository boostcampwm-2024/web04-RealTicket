import { apiClient } from '@/api/axios.ts';

import { API } from '@/constants/index.ts';

export const getPermission = (id: number) => async () => {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve('');
    }, 5000);
  });
  return apiClient.get(API.BOOKING.GET_PERMISSION(id)).then((res) => res.data);
};

export const postSeatCount = async (count: number) => {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve('');
    }, 5000);
  });
  return apiClient.post(API.BOOKING.POST_COUNT, { bookingAmount: count });
};

export const postSeat = (data: PostSeatData) => apiClient.post(API.BOOKING.POST_SEAT, data);

interface PostSeatData {
  eventId: number;
  sectionIndex: number;
  seatIndex: number;
  expectedStatus: 'deleted' | 'reserved';
}
