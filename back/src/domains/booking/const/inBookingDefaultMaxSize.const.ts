/* 좌석 선택 페이지 최대 인원 수
대기 큐 개발 모드: 1명
무한 IN_BOOKING 모드: 21억명
그 외: 100명
 */
export const IN_BOOKING_DEFAULT_MAX_SIZE =
  process.env.DEVELOPING_WAITING_QUEUE_MODE === 'true'
    ? 1
    : process.env.INFINITE_IN_BOOKING_POOL_SIZE === 'true'
      ? 2100000000
      : 100;
