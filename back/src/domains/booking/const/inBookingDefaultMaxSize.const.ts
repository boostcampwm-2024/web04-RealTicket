/* 좌석 선택 페이지 최대 인원 수
배포 환경: 100명
개발 환경: 2명
 */
export const IN_BOOKING_DEFAULT_MAX_SIZE = process.env.NODE_ENV === 'prod' || 'prod-in-dev' ? 100 : 2;
