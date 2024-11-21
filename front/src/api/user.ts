import { apiClient } from '@/api/axios.ts';

import { API } from '@/constants/index.ts';

export const postSignup = (data: UserData) => apiClient.post(API.USER.SIGNUP, data);
export const postLogin = (data: UserData) => apiClient.post(API.USER.LOGIN, data);
export const postLogout = () => apiClient.post(API.USER.LOGOUT);

export type UserData = {
  loginId: string;
  loginPassword: string;
};
