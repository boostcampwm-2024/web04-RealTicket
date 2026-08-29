import Redis from 'ioredis';

type StartSeatSelectionRawResult = Array<string | number | null>;

type RedisWithStartSeatSelectionCommand = Redis & {
  startSeatSelectionFromEntering?: (
    sessionKey: string,
    enteringKey: string,
    inBookingSessionsKey: string,
    bookingAmountKey: string,
    eventId: string,
    sid: string,
    inBookingSessionPrefix: string,
    inBookingSessionSuffix: string,
    expectedFrom: string,
    nextTo: string,
  ) => Promise<StartSeatSelectionRawResult>;
};

async function emulateStartSeatSelectionFromEntering(
  redis: Redis,
  sessionKey: string,
  enteringKey: string,
  inBookingSessionsKey: string,
  bookingAmountKey: string,
  eventId: string,
  sid: string,
  inBookingSessionPrefix: string,
  inBookingSessionSuffix: string,
  expectedFrom: string,
  nextTo: string,
): Promise<StartSeatSelectionRawResult> {
  const raw = await redis.get(sessionKey);
  if (!raw) {
    return ['SESSION_MISSING'];
  }

  const session = JSON.parse(raw) as Record<string, unknown>;

  if (session.userStatus !== expectedFrom) {
    return ['STATE_MISMATCH', session.userStatus as string];
  }

  if (session.targetEvent !== Number(eventId)) {
    return ['TARGET_EVENT_MISMATCH', session.targetEvent as number | string | null];
  }

  let bookingAmount = 0;
  const rawBookingAmount = await redis.get(bookingAmountKey);
  if (rawBookingAmount !== null) {
    const parsedBookingAmount = Number(rawBookingAmount);
    if (!Number.isFinite(parsedBookingAmount)) {
      return ['CORRUPTED_BOOKING_AMOUNT'];
    }
    bookingAmount = Math.floor(parsedBookingAmount);
  }

  session.userStatus = nextTo;

  const ttl = await redis.pttl(sessionKey);
  if (ttl === -2 || ttl === 0 || ttl < -1) {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }
  const encodedSession = JSON.stringify(session);

  if ((await redis.zrem(enteringKey, sid)) !== 1) {
    return ['NOT_ENTERING'];
  }

  await redis.del(bookingAmountKey);
  await redis.hset(
    inBookingSessionsKey,
    sid,
    `${inBookingSessionPrefix}${bookingAmount}${inBookingSessionSuffix}`,
  );

  if (ttl > 0) {
    await redis.set(sessionKey, encodedSession, 'PX', ttl);
  } else {
    await redis.set(sessionKey, encodedSession);
  }

  return ['OK'];
}

export function installStartSeatSelectionCommandMock(redis: Redis): void {
  const commandRedis = redis as RedisWithStartSeatSelectionCommand;
  const originalDefineCommand = redis.defineCommand.bind(redis);

  redis.defineCommand = function defineCommand(name: string, options: unknown) {
    if (name === 'startSeatSelectionFromEntering') {
      commandRedis.startSeatSelectionFromEntering = (...args) =>
        emulateStartSeatSelectionFromEntering(redis, ...args);
      return redis;
    }

    return originalDefineCommand(name, options as never);
  } as typeof redis.defineCommand;
}
