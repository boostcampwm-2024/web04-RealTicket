import { apiClient } from '@/api/axios.ts';

import { API } from '@/constants/index.ts';

export const getPrograms = () => apiClient.get(API.PROGRAMS.GET_PROGRAMS).then((res) => res.data);
export const getProgramsDetail = (id: number) => () =>
  apiClient.get(API.PROGRAMS.GET_DETAIL(id)).then((res) => res.data);
export const getMockProgramDetail = (id: number) => () =>
  apiClient.get(API.PROGRAMS.GET_DETAIL_MOCK(id)).then((res) => res.data);
