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
    SIGNIN: '/user/login',
    CHECK_ID: '/user/checkid',
    LOGOUT: '/user/logout',
  },
  EVENT: {
    GET_EVENT_DETAIL_MOCK: (id: number) => `/mock/events/${id}`,
  },
};
