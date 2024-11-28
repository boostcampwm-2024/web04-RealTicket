import { toast } from '@/components/Toast/index.ts';

import { ROUTE_URL } from '@/constants/index.ts';
import { auth } from '@/events/AuthEvent.ts';
import router from '@/routes/index.tsx';
import axios, { AxiosError, isAxiosError } from 'axios';

//TODO 타입 정의
const isDevelopEnvironment = import.meta.env.VITE_ENVIRONMENT === 'dev';
// const isDevelopEnvironment = true;

export const BASE_URL = import.meta.env.VITE_API_URL + (isDevelopEnvironment ? '' : '/api');
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

const EXCLUDING_AUTH_ERROR_REDIRECT_URL_LIST = ['/user'];
const UN_AUTHENTICATED_ERROR_STATUS = 403;

const canRedirect = (error: AxiosError) => {
  if (
    error.status === UN_AUTHENTICATED_ERROR_STATUS &&
    error.config?.url &&
    !EXCLUDING_AUTH_ERROR_REDIRECT_URL_LIST.includes(error.config.url)
  )
    return true;
  return false;
};
const isExclude = (error: AxiosError) => {
  if (
    error.status === UN_AUTHENTICATED_ERROR_STATUS &&
    error.config?.url &&
    EXCLUDING_AUTH_ERROR_REDIRECT_URL_LIST.includes(error.config.url)
  ) {
    return true;
  }

  return false;
};

const isError = (error: unknown) => error && isAxiosError<CustomError>(error);
//TODO 500 에러 처리 필요
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isError(error)) {
      if (canRedirect(error)) {
        toast.error('로그인이 필요합니다.\n로그인 후 이용해주세요.');
        auth.logout();
        router.navigate(ROUTE_URL.USER.LOGIN, { replace: true });
        return Promise.reject(error);
      }
      if (isExclude(error)) {
        return Promise.resolve({ data: null });
      }
      throw error;
    }
  },
);
