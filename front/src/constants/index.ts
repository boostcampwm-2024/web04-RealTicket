export const SEAT_SIZE = 10;
export const SEATS_GAP = 2;
export const SEAT_BOX_SIZE = SEAT_SIZE + SEATS_GAP;

//api
export const API = {
  PROGRAMS: {
    //TODO 단수로
    GET_PROGRAMS: '/api/program',
    GET_DETAIL: (id: number) => `/api/program/${id}`,
    GET_DETAIL_MOCK: (id: number) => `/api/mock/programs/${id}`,
  },
  USER: {
    SIGNUP: '/api/user/signup',
    LOGIN: '/api/user/login', //signin->login으로변경
    CHECK_ID: '/api/user/checkid',
    LOGOUT: '/api/user/logout',
    INFORMATION: '/api/user',
  },
  EVENT: {
    GET_EVENT_DETAIL_MOCK: (id: number) => `/api/mock/events/${id}`,
    GET_EVENT_DETAIL: (id: number) => `/apievent/${id}`,
  },
  PLACE: {
    GET_PLACE_INFORMATION: (id: number) => `/api/place/seats/${id}`,
  },
};
