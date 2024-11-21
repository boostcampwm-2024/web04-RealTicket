import { transformKey } from '@/utils/transform.ts';

import axios, { AxiosError } from 'axios';
import { camelCase } from 'es-toolkit/compat';

//TODO 타입 정의
const BASE_URL = import.meta.env.VITE_API_URL;
type ErrorData = {
  error: string;
  message: string;
  statusCode: number;
};
export type CustomError = AxiosError<ErrorData>;

export const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

apiClient.interceptors.response.use((response) => {
  if (response.data) {
    response.data = transformKey(response.data, camelCase);
  }
  return response;
});
