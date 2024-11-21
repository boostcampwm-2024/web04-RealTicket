import { apiClient } from '@/api/axios.ts';

import { API } from '@/constants/index.ts';

export const postSignup = (data: SignData) => apiClient.post(API.USER.SIGNUP, data);
export const postSignin = (data: SignData) => apiClient.post(API.USER.LOGIN, data);
export const postLogout = () => apiClient.post(API.USER.LOGOUT);

export type SignData = {
  login_id: string;
  login_password: string;
};
