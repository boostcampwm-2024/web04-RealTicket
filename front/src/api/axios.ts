import axios from 'axios';

const HOST = import.meta.env.HOST;
const PORT = import.meta.env.PORT;
const BASE_URL = `${HOST}:${PORT}`;

export const apiClient = axios.create({
  baseURL: BASE_URL,
});
