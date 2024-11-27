export const SEAT_SIZE = 10;
export const SEATS_GAP = 2;
export const SEAT_BOX_SIZE = SEAT_SIZE + SEATS_GAP;

//api
export const API = {
  PROGRAMS: {
    //TODO 단수로
    GET_PROGRAMS: '/program',
    GET_DETAIL: (id: number) => `/program/${id}`,
    GET_DETAIL_MOCK: (id: number) => `/mock/programs/${id}`,
  },
  USER: {
    SIGNUP: '/user/signup',
    LOGIN: '/user/login', //signin->login으로변경
    CHECK_ID: '/user/checkid',
    LOGOUT: '/user/logout',
    INFORMATION: '/user',
  },
  EVENT: {
    GET_EVENT_DETAIL_MOCK: (id: number) => `/mock/events/${id}`,
    GET_EVENT_DETAIL: (id: number) => `/event/${id}`,
  },
  PLACE: {
    GET_PLACE_INFORMATION: (id: number) => `/place/seat/${id}`,
  },
  RESERVATION: {
    GET_RESERVATION: '/reservation',
    DELETE_RESERVATION: (id: number) => `/reservation/${id}`,
    POST_RESERVATION: `/reservation`,
  },
  BOOKING: {
    GET_SEATS_SSE: (id: number) => `/booking/seat/${id}`,
    GET_SEATS_SSE_MOCK: `/mock/events/seat/1`,
    GET_PERMISSION: (id: number) => `/booking/permission/${id}`,
    POST_COUNT: `/booking/count`,
    POST_SEAT: `/booking`,
    GET_RE_PERMISSION: (id: number) => `/booking/re-permission/${id}`,
  },
};
