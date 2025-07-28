/* Entering 세션 생존시간
배포 모드: 2분
그 외: 30초
 */
export const ENTERING_SESSION_EXPIRY =
  process.env.ENTERING_SESSION_EXPIRE_MODE === 'prod' ? 2 * 60 * 1000 : 30 * 1000;

/* Entering 세션 GC 주기
배포 모드: 1분
그 외: 10초
 */
export const ENTERING_GC_INTERVAL =
  process.env.ENTERING_SESSION_EXPIRE_MODE === 'prod' ? 60 * 1000 : 10 * 1000;
