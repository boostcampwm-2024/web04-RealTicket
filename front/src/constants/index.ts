export const SEAT_SIZE = 10;
export const SEATS_GAP = 2;
export const SEAT_BOX_SIZE = SEAT_SIZE + SEATS_GAP;

//api
export const API = {
  PROGRAMS: {
    GET_PROGRAMS: '/program',
    GET_DETAIL: (id: number) => `/program/${id}`,
  },
  USER: {
    SIGNUP: '/user/signup',
    SIGNIN: '/user/signin',
    CHECK_ID: '/user/checkid',
    LOGOUT: '/user/logout',
  },
};
