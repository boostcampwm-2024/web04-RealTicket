import { apiClient } from '@/api/axios.ts';

import { api } from '@/constants/index.ts';
import { IProgram } from '@/type/index.ts';

export const getPrograms = () => apiClient.get<IProgram[]>(api.program.get).then((res) => res.data);
