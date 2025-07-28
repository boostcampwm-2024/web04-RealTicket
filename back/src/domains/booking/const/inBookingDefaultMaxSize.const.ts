/* 좌석 선택 페이지 최대 인원 수
배포 모드: 100명
대기 큐 개발 모드: 1명
 */
export const IN_BOOKING_DEFAULT_MAX_SIZE = process.env.DEVELOPING_WAITING_QUEUE_MODE === 'true' ? 1 : 100;
