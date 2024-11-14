import axios from 'axios';

const BASE_URL = `${process.env.BASE_URL}:${process.env.PORT}`;

export const apiClient = axios.create({
  baseURL: BASE_URL,
});
