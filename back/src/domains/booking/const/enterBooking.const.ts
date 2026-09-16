// 입장 세션 만료 시간(ms).
export const ENTERING_SESSION_EXPIRY =
  process.env.ENTERING_SESSION_EXPIRE_MODE === 'prod' ? 2 * 60 * 1000 : 30 * 1000;

// 입장 세션 GC 주기(ms).
export const ENTERING_GC_INTERVAL =
  process.env.ENTERING_SESSION_EXPIRE_MODE === 'prod' ? 60 * 1000 : 10 * 1000;
