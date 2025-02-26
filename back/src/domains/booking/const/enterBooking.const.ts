/* Entering 세션 생존시간
배포 환경: 2분
개발 환경: 30초
 */
export const ENTERING_SESSION_EXPIRY =
  process.env.NODE_ENV === 'prod' || 'prod-in-dev' ? 2 * 60 * 1000 : 30 * 1000;

/* Entering 세션 GC 주기
배포 환경: 1분
개발 환경: 10초
 */
export const ENTERING_GC_INTERVAL = process.env.NODE_ENV === 'prod' || 'prod-in-dev' ? 60 * 1000 : 10 * 1000;
