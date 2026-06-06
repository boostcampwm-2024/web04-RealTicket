import Redis from 'ioredis';

type UserStateRawResult = Array<string | number | null>;

type RedisWithUserStateTransitionCommand = Redis & {
  userStateTransition?: (
    sessionKey: string,
    expectedFromMode: string,
    expectedFromValue: string,
    nextTo: string,
    targetEventPatchMode: string,
    targetEventPatchValue: string,
    expectedTargetEventMode: string,
    expectedTargetEventValue: string,
  ) => Promise<UserStateRawResult>;
};

async function emulateUserStateTransition(
  redis: Redis,
  sessionKey: string,
  expectedFromMode: string,
  expectedFromValue: string,
  nextTo: string,
  targetEventPatchMode: string,
  targetEventPatchValue: string,
  expectedTargetEventMode: string,
  expectedTargetEventValue: string,
): Promise<UserStateRawResult> {
  const raw = await redis.get(sessionKey);
  if (!raw) {
    return ['SESSION_MISSING'];
  }

  const session = JSON.parse(raw) as Record<string, unknown>;

  if (expectedFromMode === 'value' && session.userStatus !== expectedFromValue) {
    return ['STATE_MISMATCH', session.userStatus as string];
  }

  if (expectedTargetEventMode !== 'none') {
    const expectedTargetEvent = expectedTargetEventMode === 'null' ? null : Number(expectedTargetEventValue);
    if (session.targetEvent !== expectedTargetEvent) {
      return ['TARGET_EVENT_MISMATCH', session.targetEvent as number | string | null];
    }
  }

  session.userStatus = nextTo;

  if (targetEventPatchMode === 'set') {
    session.targetEvent = Number(targetEventPatchValue);
  } else if (targetEventPatchMode === 'clear') {
    session.targetEvent = null;
  }

  const ttl = await redis.pttl(sessionKey);
  if (ttl === -2 || ttl === 0 || ttl < -1) {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }

  const encodedSession = JSON.stringify(session);
  if (ttl > 0) {
    await redis.set(sessionKey, encodedSession, 'PX', ttl);
  } else {
    await redis.set(sessionKey, encodedSession);
  }

  return ['OK'];
}

export function installUserStateTransitionCommandMock(redis: Redis): void {
  const commandRedis = redis as RedisWithUserStateTransitionCommand;
  const originalDefineCommand = redis.defineCommand.bind(redis);

  redis.defineCommand = function defineCommand(name: string, options: unknown) {
    if (name === 'userStateTransition') {
      commandRedis.userStateTransition = (...args) => emulateUserStateTransition(redis, ...args);
      return redis;
    }

    return originalDefineCommand(name, options as never);
  } as typeof redis.defineCommand;
}
