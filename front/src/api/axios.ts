import { transformKey } from '@/utils/transform.ts';

import axios, { AxiosError } from 'axios';
import { camelCase } from 'es-toolkit/compat';

//TODO 타입 정의
const apiUrl = import.meta.env.VITE_API_URL;
type ErrorData = {
  error: string;
  message: string;
  statusCode: number;
};
export type CustomError = AxiosError<ErrorData>;

export const apiClient = axios.create({
  baseURL: apiUrl,
  withCredentials: true, //TODO cors정책 떄문에 설정 x ,나중에 변경 필요
});

apiClient.interceptors.response.use((response) => {
  if (response.data) {
    response.data = transformKey(response.data, camelCase);
  }
  return response;
});
