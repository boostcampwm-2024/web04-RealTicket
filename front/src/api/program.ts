import { apiClient } from '@/api/axios.ts';

import { API } from '@/constants/index.ts';
import { IProgram } from '@/type/index.ts';

export const getPrograms = () => apiClient.get<IProgram[]>(API.PROGRAMS.GET_PROGRAMS).then((res) => res.data);
