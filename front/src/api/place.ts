import { apiClient } from '@/api/axios.ts';

import { API } from '@/constants/index.ts';

export const getPlaceInformation = (id: number) => () =>
  apiClient.get(API.PLACE.GET_PLACE_INFORMATION(id)).then((res) => res.data);
