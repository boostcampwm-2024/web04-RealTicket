import Redis from 'ioredis';

import { USER_STATUS } from '../../auth/fsm/user-state.fsm';

type AdmissionRawResult = Array<string | number | null>;

type RedisWithAdmissionCommands = Redis & {
  admitBookingGateImmediate?: (
    sessionKey: string,
    enteringKey: string,
    inBookingSessionsKey: string,
    reconnectingKey: string,
    maxSizeKey: string,
    eventId: string,
    defaultMaxSizeKey: string,
    defaultMaxSize: string,
    nowMs: string,
  ) => Promise<AdmissionRawResult>;
  promoteWaitingQueueHead?: (
    waitingQueueKey: string,
    enteringKey: string,
    inBookingSessionsKey: string,
    reconnectingKey: string,
    maxSizeKey: string,
    defaultMaxSizeKey: string,
    eventId: string,
    userKeyPrefix: string,
    defaultMaxSize: string,
    nowMs: string,
  ) => Promise<AdmissionRawResult>;
};

async function getAdmissionMaxSize(
  redis: Redis,
  maxSizeKey: string,
  defaultMaxSizeKey: string,
  defaultMaxSize: string,
): Promise<number> {
  const eventMaxSize = await redis.get(maxSizeKey);
  if (eventMaxSize) {
    return Number(eventMaxSize);
  }

  const redisDefaultMaxSize = await redis.get(defaultMaxSizeKey);
  return redisDefaultMaxSize ? Number(redisDefaultMaxSize) : Number(defaultMaxSize);
}

async function hasAdmissionCapacity(
  redis: Redis,
  inBookingSessionsKey: string,
  reconnectingKey: string,
  enteringKey: string,
  maxSizeKey: string,
  defaultMaxSizeKey: string,
  defaultMaxSize: string,
): Promise<boolean> {
  const inBookingCount = await redis.hlen(inBookingSessionsKey);
  const reconnectingCount = await redis.zcard(reconnectingKey);
  const enteringCount = await redis.zcard(enteringKey);
  const maxSize = await getAdmissionMaxSize(redis, maxSizeKey, defaultMaxSizeKey, defaultMaxSize);

  return inBookingCount + reconnectingCount + enteringCount < maxSize;
}

async function writePreparedSession(
  redis: Redis,
  sessionKey: string,
  encodedSession: string,
  ttl: number,
): Promise<void> {
  if (ttl > 0) {
    await redis.set(sessionKey, encodedSession, 'PX', ttl);
    return;
  }

  await redis.set(sessionKey, encodedSession);
}

async function emulateImmediateAdmission(
  redis: Redis,
  sessionKey: string,
  enteringKey: string,
  inBookingSessionsKey: string,
  reconnectingKey: string,
  maxSizeKey: string,
  eventId: string,
  defaultMaxSizeKey: string,
  defaultMaxSize: string,
  nowMs: string,
): Promise<AdmissionRawResult> {
  const raw = await redis.get(sessionKey);
  if (!raw) {
    return ['SESSION_MISSING'];
  }

  const session = JSON.parse(raw) as Record<string, unknown>;
  if (session.userStatus !== USER_STATUS.LOGIN) {
    return ['STATE_MISMATCH', session.userStatus as string];
  }

  if (session.targetEvent !== null) {
    return ['TARGET_EVENT_MISMATCH', session.targetEvent as number | string];
  }

  if (
    !(await hasAdmissionCapacity(
      redis,
      inBookingSessionsKey,
      reconnectingKey,
      enteringKey,
      maxSizeKey,
      defaultMaxSizeKey,
      defaultMaxSize,
    ))
  ) {
    return ['CAPACITY_FULL'];
  }

  session.userStatus = USER_STATUS.ENTERING;
  session.targetEvent = Number(eventId);
  const ttl = await redis.pttl(sessionKey);
  if (ttl === -2 || ttl === 0) {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }
  if (ttl < -1) {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }

  const encodedSession = JSON.stringify(session);
  const sid = sessionKey.replace(/^user:/, '');
  await redis.zadd(enteringKey, nowMs, sid);
  await writePreparedSession(redis, sessionKey, encodedSession, ttl);
  return ['OK'];
}

async function emulateWaitingHeadPromotion(
  redis: Redis,
  waitingQueueKey: string,
  enteringKey: string,
  inBookingSessionsKey: string,
  reconnectingKey: string,
  maxSizeKey: string,
  defaultMaxSizeKey: string,
  eventId: string,
  userKeyPrefix: string,
  defaultMaxSize: string,
  nowMs: string,
): Promise<AdmissionRawResult> {
  const head = await redis.lindex(waitingQueueKey, 0);
  if (!head) {
    return ['QUEUE_EMPTY'];
  }

  const item = JSON.parse(head) as Record<string, unknown>;
  const sid = item.sid as string;

  if (
    !(await hasAdmissionCapacity(
      redis,
      inBookingSessionsKey,
      reconnectingKey,
      enteringKey,
      maxSizeKey,
      defaultMaxSizeKey,
      defaultMaxSize,
    ))
  ) {
    return ['CAPACITY_FULL'];
  }

  const sessionKey = `${userKeyPrefix}${sid}`;
  const raw = await redis.get(sessionKey);
  if (!raw) {
    await redis.lpop(waitingQueueKey);
    return ['STALE_SESSION_MISSING', sid];
  }

  const session = JSON.parse(raw) as Record<string, unknown>;
  if (session.userStatus !== USER_STATUS.WAITING) {
    await redis.lpop(waitingQueueKey);
    return ['STALE_STATE_MISMATCH', session.userStatus as string];
  }

  if (session.targetEvent !== Number(eventId)) {
    await redis.lpop(waitingQueueKey);
    return ['STALE_TARGET_EVENT_MISMATCH', session.targetEvent as number | string];
  }

  session.userStatus = USER_STATUS.ENTERING;
  const ttl = await redis.pttl(sessionKey);
  if (ttl === -2 || ttl === 0) {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }
  if (ttl < -1) {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }

  const encodedSession = JSON.stringify(session);
  await redis.zadd(enteringKey, nowMs, sid);
  await redis.lpop(waitingQueueKey);
  await writePreparedSession(redis, sessionKey, encodedSession, ttl);
  return ['OK'];
}

export function installAdmissionCapacityCommandMock(redis: Redis): void {
  const commandRedis = redis as RedisWithAdmissionCommands;
  const originalDefineCommand = redis.defineCommand.bind(redis);

  redis.defineCommand = function defineCommand(name: string, options: unknown) {
    if (name === 'admitBookingGateImmediate') {
      commandRedis.admitBookingGateImmediate = (...args) => emulateImmediateAdmission(redis, ...args);
      return redis;
    }

    if (name === 'promoteWaitingQueueHead') {
      commandRedis.promoteWaitingQueueHead = (...args) => emulateWaitingHeadPromotion(redis, ...args);
      return redis;
    }

    return originalDefineCommand(name, options as never);
  } as typeof redis.defineCommand;
}
