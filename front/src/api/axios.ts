import axios, { AxiosError } from 'axios';

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
});
