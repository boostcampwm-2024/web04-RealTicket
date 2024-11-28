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
const UN_AUTHENTICATION_ERROR_STATUS = 403;
const UN_AUTHORIZATION_ERROR_STATUS = 401;
const isAuthenticateError = (error: AxiosError) => {
  if (
    error.status === UN_AUTHENTICATION_ERROR_STATUS &&
    error.config?.url &&
    !EXCLUDING_AUTH_ERROR_REDIRECT_URL_LIST.includes(error.config.url)
  )
    return true;
  return false;
};

const isAuthorizationError = (error: AxiosError) => {
  if (error.status === UN_AUTHORIZATION_ERROR_STATUS) {
    return true;
  }
  return false;
};

const isServerError = (error: AxiosError) => {
  if (error.status && error.status >= 500 && error.status < 600) {
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
      if (isAuthenticateError(error)) {
        toast.error('로그인이 필요합니다.\n로그인 후 이용해주세요.');
        auth.logout();
        router.navigate(ROUTE_URL.USER.LOGIN, { replace: true });
      }
      if (isAuthorizationError(error)) {
        toast.error('잘못된 접근입니다.\n다시 시도해주세요.');
        router.navigate('/', { replace: true });
      }
      if (isServerError(error)) {
        toast.error('서버에 문제가 있습니다.\n잠시 후 다시 시도해주세요.');
      }
      throw error;
    }
  },
);
