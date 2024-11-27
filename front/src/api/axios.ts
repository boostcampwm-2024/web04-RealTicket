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
const NOT_LOGIN_ERROR_STATUS = 403;

//TODO AuthContext logout 처리 필요, 현재 login상태가 true인데, cookie의 서버 세션이 만료된 경우
const canRedirect = (error: AxiosError) => {
  if (
    error.status === NOT_LOGIN_ERROR_STATUS &&
    error.config?.url &&
    !EXCLUDING_AUTH_ERROR_REDIRECT_URL_LIST.includes(error.config.url)
  )
    return true;
  return false;
};
//TODO 500 에러 처리 필요
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error && isAxiosError<CustomError>(error)) {
      if (canRedirect(error)) {
        alert('로그인이 필요합니다.');
        auth.logout();
        router.navigate('/login', { replace: true });
      }
      throw error;
    }
  },
);
