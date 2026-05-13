import { apiClient } from '@/api/axios.ts';

import { API } from '@/constants/index.ts';
import type { ServerTimeResult } from '@/type/booking.ts';

export const getPermission = (id: number) => () =>
  apiClient.get(API.BOOKING.GET_PERMISSION(id)).then((res) => res.data);
export const getServerTime = (): Promise<ServerTimeResult> =>
  apiClient.get(API.BOOKING.GET_SERVER_TIME).then((res) => res.data);
export const postSeatCount = (count: number) =>
  apiClient.post(API.BOOKING.POST_COUNT, { bookingAmount: count });
export const postSeat = (data: PostSeatData) => apiClient.post(API.BOOKING.POST_SEAT, data);

export interface PostSeatData {
  eventId: number;
  sectionIndex: number;
  seatIndex: number;
  expectedStatus: 'deleted' | 'reserved';
}

export interface PatchSectionData {
  sectionIndex: number;
}

export interface PatchSectionResponse {
  sectionIndex: number;
  seatStatus: number[];
}

// per D-01, D-03, D-05
// axios interceptor가 response.data = response.data.data 언래핑을 처리하므로
// .then((res) => res.data) 만 사용 (NOT .then((res) => res.data.data))
export const patchSection = (data: PatchSectionData): Promise<PatchSectionResponse> =>
  apiClient.patch(API.BOOKING.PATCH_SECTION, data).then((res) => res.data);
