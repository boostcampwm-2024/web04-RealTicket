import Redis from 'ioredis';

import { USER_STATUS } from '../../auth/fsm/user-state.fsm';

type WaitingQueueEntryRawResult = Array<string | number | null>;

type RedisWithWaitingQueueEntryCommand = Redis & {
  enterWaitingQueue?: (
    sessionKey: string,
    waitingQueueKey: string,
    waitingOrderKey: string,
    eventId: string,
    sid: string,
  ) => Promise<WaitingQueueEntryRawResult>;
};

async function emulateEnterWaitingQueue(
  redis: Redis,
  sessionKey: string,
  waitingQueueKey: string,
  waitingOrderKey: string,
  eventId: string,
  sid: string,
): Promise<WaitingQueueEntryRawResult> {
  const raw = await redis.get(sessionKey);
  if (!raw) {
    return ['SESSION_MISSING'];
  }

  const session = JSON.parse(raw) as Record<string, unknown>;

  if (session.userStatus !== USER_STATUS.LOGIN) {
    return ['STATE_MISMATCH', session.userStatus as string];
  }

  if (session.targetEvent !== null) {
    return ['TARGET_EVENT_MISMATCH', session.targetEvent as number | string | null];
  }

  const order = await redis.incr(waitingOrderKey);

  session.userStatus = USER_STATUS.WAITING;
  session.targetEvent = Number(eventId);
  session.waitingOrder = order;

  const ttl = await redis.pttl(sessionKey);
  if (ttl === -2 || ttl === 0 || ttl < -1) {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }

  const encodedSession = JSON.stringify(session);
  await redis.rpush(waitingQueueKey, JSON.stringify({ sid, order }));

  if (ttl > 0) {
    await redis.set(sessionKey, encodedSession, 'PX', ttl);
  } else {
    await redis.set(sessionKey, encodedSession);
  }

  return ['OK', order];
}

export function installWaitingQueueEntryCommandMock(redis: Redis): void {
  const commandRedis = redis as RedisWithWaitingQueueEntryCommand;
  const originalDefineCommand = redis.defineCommand.bind(redis);

  redis.defineCommand = function defineCommand(name: string, options: unknown) {
    if (name === 'enterWaitingQueue') {
      commandRedis.enterWaitingQueue = (...args) => emulateEnterWaitingQueue(redis, ...args);
      return redis;
    }

    return originalDefineCommand(name, options as never);
  } as typeof redis.defineCommand;
}
