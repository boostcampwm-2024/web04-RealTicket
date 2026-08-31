import Redis from 'ioredis';

type ReconnectingRawResult = Array<string | number | null>;

type RedisWithReconnectingTransitionCommands = Redis & {
  markReconnectingSelecting?: (
    sessionKey: string,
    reconnectingKey: string,
    eventId: string,
    sid: string,
    nowMs: string,
    expectedFrom: string,
    nextTo: string,
  ) => Promise<ReconnectingRawResult>;
  restoreSelectingSeat?: (
    sessionKey: string,
    reconnectingKey: string,
    eventId: string,
    sid: string,
    expectedFrom: string,
    nextTo: string,
  ) => Promise<ReconnectingRawResult>;
};

type PreparedSessionWrite =
  | { code: 'OK'; encodedSession: string; ttl: number }
  | { code: 'SESSION_EXPIRED_DURING_WRITE' };

async function prepareSessionWrite(
  redis: Redis,
  sessionKey: string,
  session: Record<string, unknown>,
): Promise<PreparedSessionWrite> {
  const ttl = await redis.pttl(sessionKey);
  if (ttl === -2 || ttl === 0 || ttl < -1) {
    return { code: 'SESSION_EXPIRED_DURING_WRITE' };
  }

  return { code: 'OK', encodedSession: JSON.stringify(session), ttl };
}

async function writePreparedSessionPreservingTtl(
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

async function readTransitionableSession(
  redis: Redis,
  sessionKey: string,
  expectedFrom: string,
  eventId: string,
): Promise<{ session: Record<string, unknown> } | { denial: ReconnectingRawResult }> {
  const raw = await redis.get(sessionKey);
  if (!raw) {
    return { denial: ['SESSION_MISSING'] };
  }

  const session = JSON.parse(raw) as Record<string, unknown>;

  if (session.userStatus !== expectedFrom) {
    return { denial: ['STATE_MISMATCH', session.userStatus as string] };
  }

  if (session.targetEvent !== Number(eventId)) {
    return { denial: ['TARGET_EVENT_MISMATCH', session.targetEvent as number | string | null] };
  }

  return { session };
}

async function emulateMarkReconnectingSelecting(
  redis: Redis,
  sessionKey: string,
  reconnectingKey: string,
  eventId: string,
  sid: string,
  nowMs: string,
  expectedFrom: string,
  nextTo: string,
): Promise<ReconnectingRawResult> {
  const read = await readTransitionableSession(redis, sessionKey, expectedFrom, eventId);
  if ('denial' in read) {
    return read.denial;
  }

  read.session.userStatus = nextTo;

  const prepared = await prepareSessionWrite(redis, sessionKey, read.session);
  if (prepared.code !== 'OK') {
    return [prepared.code];
  }

  await redis.zadd(reconnectingKey, Number(nowMs), sid);
  await writePreparedSessionPreservingTtl(redis, sessionKey, prepared.encodedSession, prepared.ttl);

  return ['OK'];
}

async function emulateRestoreSelectingSeat(
  redis: Redis,
  sessionKey: string,
  reconnectingKey: string,
  eventId: string,
  sid: string,
  expectedFrom: string,
  nextTo: string,
): Promise<ReconnectingRawResult> {
  const read = await readTransitionableSession(redis, sessionKey, expectedFrom, eventId);
  if ('denial' in read) {
    return read.denial;
  }

  read.session.userStatus = nextTo;

  const prepared = await prepareSessionWrite(redis, sessionKey, read.session);
  if (prepared.code !== 'OK') {
    return [prepared.code];
  }

  if ((await redis.zrem(reconnectingKey, sid)) !== 1) {
    return ['NOT_RECONNECTING'];
  }

  await writePreparedSessionPreservingTtl(redis, sessionKey, prepared.encodedSession, prepared.ttl);

  return ['OK'];
}

export function installReconnectingTransitionCommandMock(redis: Redis): void {
  const commandRedis = redis as RedisWithReconnectingTransitionCommands;
  const originalDefineCommand = redis.defineCommand.bind(redis);

  redis.defineCommand = function defineCommand(name: string, options: unknown) {
    if (name === 'markReconnectingSelecting') {
      commandRedis.markReconnectingSelecting = (...args) => emulateMarkReconnectingSelecting(redis, ...args);
      return redis;
    }

    if (name === 'restoreSelectingSeat') {
      commandRedis.restoreSelectingSeat = (...args) => emulateRestoreSelectingSeat(redis, ...args);
      return redis;
    }

    return originalDefineCommand(name, options as never);
  } as typeof redis.defineCommand;
}
