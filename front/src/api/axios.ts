import router from '@/routes/index.tsx';
import axios, { AxiosError, isAxiosError } from 'axios';

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

const EXCLUDING_AUTH_ERROR_REDIRECT_URL_LIST = ['/user'];

const NOT_LOGIN_ERROR_STATUS = 403;

const canRedirect = (error: AxiosError) => {
  if (
    error.status === NOT_LOGIN_ERROR_STATUS &&
    error.config?.url &&
    !EXCLUDING_AUTH_ERROR_REDIRECT_URL_LIST.includes(error.config.url)
  )
    return true;
  return false;
};

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error && isAxiosError<CustomError>(error)) {
      if (canRedirect(error)) {
        alert('로그인이 필요합니다.');
        router.navigate('/login');
      }
      throw error;
    }
  },
);
