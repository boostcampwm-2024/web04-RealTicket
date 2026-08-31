import { readFileSync } from 'fs';
import { join } from 'path';

import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { USER_STATE_TRANSITIONS, USER_STATUS } from '../../../auth/fsm/user-state.fsm';

import {
  IMMEDIATE_ADMISSION_BUSINESS_CODES,
  IMMEDIATE_ADMISSION_TRANSITION,
  WAITING_HEAD_PROMOTION_BUSINESS_CODES,
  WAITING_HEAD_PROMOTION_TRANSITION,
  immediateAdmissionLua,
  mapImmediateAdmissionLuaResult,
  mapWaitingHeadPromotionLuaResult,
  runImmediateAdmissionLua,
  runWaitingHeadPromotionLua,
  waitingHeadPromotionLua,
} from './admissionCapacityLua';

type RedisWithAdmissionCommands = Redis & {
  admitBookingGateImmediate?: jest.Mock;
  promoteWaitingQueueHead?: jest.Mock;
};

type ImmediateAdmissionCommandArgs = [
  sessionKey: string,
  enteringKey: string,
  inBookingSessionsKey: string,
  reconnectingKey: string,
  maxSizeKey: string,
  eventId: string,
  defaultMaxSizeKey: string,
  defaultMaxSize: string,
  nowMs: string,
  expectedFrom: string,
  nextTo: string,
];

type WaitingHeadPromotionCommandArgs = [
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
  expectedFrom: string,
  nextTo: string,
];

const admissionKeys = {
  enteringKey: 'entering:42',
  inBookingSessionsKey: 'in-booking:42:sessions',
  reconnectingKey: 'reconnecting:42',
  maxSizeKey: 'in-booking:42:max-size',
  defaultMaxSizeKey: 'in-booking:default-max-size',
};

const baseSession = {
  id: 1,
  loginId: 'guest-1',
  roles: ['USER'],
  targetEvent: null,
  userStatus: USER_STATUS.LOGIN,
};

function createAdmissionCommandRedis(rawResult: unknown = ['OK']): RedisWithAdmissionCommands {
  return {
    defineCommand: jest.fn(function (this: RedisWithAdmissionCommands, name: string) {
      this[name as 'admitBookingGateImmediate' | 'promoteWaitingQueueHead'] = jest
        .fn()
        .mockResolvedValue(rawResult);
      return this;
    }),
  } as unknown as RedisWithAdmissionCommands;
}

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

async function emulateImmediateAdmissionCommand(
  redis: Redis,
  ...[
    sessionKey,
    enteringKey,
    inBookingSessionsKey,
    reconnectingKey,
    maxSizeKey,
    eventId,
    defaultMaxSizeKey,
    defaultMaxSize,
    nowMs,
    expectedFrom,
    nextTo,
  ]: ImmediateAdmissionCommandArgs
) {
  const raw = await redis.get(sessionKey);
  if (!raw) {
    return ['SESSION_MISSING'];
  }

  const session = JSON.parse(raw) as Record<string, unknown>;
  if (session.userStatus !== expectedFrom) {
    return ['STATE_MISMATCH', session.userStatus];
  }

  if (session.targetEvent !== null) {
    return ['TARGET_EVENT_MISMATCH', session.targetEvent];
  }

  const inBookingCount = await redis.hlen(inBookingSessionsKey);
  const reconnectingCount = await redis.zcard(reconnectingKey);
  const enteringCount = await redis.zcard(enteringKey);
  const maxSize = await getAdmissionMaxSize(redis, maxSizeKey, defaultMaxSizeKey, defaultMaxSize);

  if (inBookingCount + reconnectingCount + enteringCount >= maxSize) {
    return ['CAPACITY_FULL'];
  }

  session.userStatus = nextTo;
  session.targetEvent = Number(eventId);

  const ttl = await redis.pttl(sessionKey);
  if (ttl === -2 || ttl === 0) {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }

  await redis.zadd(enteringKey, nowMs, sessionKey.replace(/^user:/, ''));
  if (ttl > 0) {
    await redis.set(sessionKey, JSON.stringify(session), 'PX', ttl);
  } else if (ttl === -1) {
    await redis.set(sessionKey, JSON.stringify(session));
  } else {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }

  return ['OK'];
}

async function emulateWaitingHeadPromotionCommand(
  redis: Redis,
  ...[
    waitingQueueKey,
    enteringKey,
    inBookingSessionsKey,
    reconnectingKey,
    maxSizeKey,
    defaultMaxSizeKey,
    eventId,
    userKeyPrefix,
    defaultMaxSize,
    nowMs,
    expectedFrom,
    nextTo,
  ]: WaitingHeadPromotionCommandArgs
) {
  const head = await redis.lindex(waitingQueueKey, 0);
  if (!head) {
    return ['QUEUE_EMPTY'];
  }

  const item = JSON.parse(head) as Record<string, unknown>;
  const sid = item.sid as string;

  const inBookingCount = await redis.hlen(inBookingSessionsKey);
  const reconnectingCount = await redis.zcard(reconnectingKey);
  const enteringCount = await redis.zcard(enteringKey);
  const maxSize = await getAdmissionMaxSize(redis, maxSizeKey, defaultMaxSizeKey, defaultMaxSize);

  if (inBookingCount + reconnectingCount + enteringCount >= maxSize) {
    return ['CAPACITY_FULL'];
  }

  const sessionKey = `${userKeyPrefix}${sid}`;
  const raw = await redis.get(sessionKey);
  if (!raw) {
    await redis.lpop(waitingQueueKey);
    return ['STALE_SESSION_MISSING', sid];
  }

  const session = JSON.parse(raw) as Record<string, unknown>;
  if (session.userStatus !== expectedFrom) {
    await redis.lpop(waitingQueueKey);
    return ['STALE_STATE_MISMATCH', session.userStatus];
  }

  if (session.targetEvent !== Number(eventId)) {
    await redis.lpop(waitingQueueKey);
    return ['STALE_TARGET_EVENT_MISMATCH', session.targetEvent];
  }

  session.userStatus = nextTo;

  const ttl = await redis.pttl(sessionKey);
  if (ttl === -2 || ttl === 0) {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }

  await redis.zadd(enteringKey, nowMs, sid);
  await redis.lpop(waitingQueueKey);
  if (ttl > 0) {
    await redis.set(sessionKey, JSON.stringify(session), 'PX', ttl);
  } else if (ttl === -1) {
    await redis.set(sessionKey, JSON.stringify(session));
  } else {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }
  return ['OK'];
}

function installAdmissionCommandStub(redis: Redis): jest.SpyInstance {
  return jest.spyOn(redis, 'defineCommand').mockImplementation(function (
    this: RedisWithAdmissionCommands,
    name: string,
  ) {
    if (name === 'admitBookingGateImmediate') {
      this.admitBookingGateImmediate = jest.fn((...args: ImmediateAdmissionCommandArgs) =>
        emulateImmediateAdmissionCommand(redis, ...args),
      );
    }

    if (name === 'promoteWaitingQueueHead') {
      this.promoteWaitingQueueHead = jest.fn((...args: WaitingHeadPromotionCommandArgs) =>
        emulateWaitingHeadPromotionCommand(redis, ...args),
      );
    }

    return this;
  } as never);
}

describe('admissionCapacityLua 계약', () => {
  it('즉시 입장과 대기열 head 승격 business code를 path별로 제한함', () => {
    expect(IMMEDIATE_ADMISSION_BUSINESS_CODES).toEqual(['CAPACITY_FULL']);
    expect(WAITING_HEAD_PROMOTION_BUSINESS_CODES).toEqual([
      'CAPACITY_FULL',
      'QUEUE_EMPTY',
      'STALE_SESSION_MISSING',
      'STALE_STATE_MISMATCH',
      'STALE_TARGET_EVENT_MISMATCH',
    ]);
  });

  it('즉시 입장 CAPACITY_FULL을 LOGIN에서 ENTERING 전이의 내부 결과로 매핑함', () => {
    expect(mapImmediateAdmissionLuaResult(['CAPACITY_FULL'])).toEqual({
      ok: false,
      code: 'CAPACITY_FULL',
      action: 'enterBookingGate',
      expectedFrom: USER_STATUS.LOGIN,
      nextTo: USER_STATUS.ENTERING,
      details: [],
    });
  });

  it('대기열 head 승격 stale 결과를 WAITING에서 ENTERING 전이의 내부 결과로 매핑함', () => {
    expect(mapWaitingHeadPromotionLuaResult(['STALE_STATE_MISMATCH', USER_STATUS.LOGIN])).toEqual({
      ok: false,
      code: 'STALE_STATE_MISMATCH',
      action: 'enterBookingGate',
      expectedFrom: USER_STATUS.WAITING,
      nextTo: USER_STATUS.ENTERING,
      details: [USER_STATUS.LOGIN],
    });
  });

  it('선언하지 않은 입장 Lua 결과 코드는 인프라 계약 오류로 throw함', () => {
    const undeclaredCode = ['STALE_SESSION_MISSING'] as never;

    expect(() => mapImmediateAdmissionLuaResult(undeclaredCode)).toThrow(
      'Unknown Lua user state transition code',
    );
  });

  it('입장 Lua 소스는 malformed-session business code와 mock JSON fallback을 도입하지 않음', () => {
    const source = readFileSync(join(__dirname, 'admissionCapacityLua.ts'), 'utf8');
    const removedHotPathTerms = [
      'MALFORMED_' + 'SESSION',
      'MOCK_JSON_' + 'NULL',
      'decodeSession' + 'Json',
      'replaceJson' + 'Field',
      'has' + 'Cjson',
    ];

    for (const removedTerm of removedHotPathTerms) {
      expect(source).not.toContain(removedTerm);
    }
  });

  it('공유 Lua helper는 Redis-side capacity 계산을 제공함', () => {
    const source = readFileSync(join(__dirname, 'admissionCapacityLua.ts'), 'utf8');

    expect(source).toContain('local function hasAdmissionCapacity');
    expect(source).toContain("redis.call('HLEN', inBookingSessionsKey)");
  });

  it('TTL 보존 쓰기를 자체 구현하지 않고 공용 helper에 위임함', () => {
    const source = readFileSync(join(__dirname, 'admissionCapacityLua.ts'), 'utf8');

    expect(source).toContain('sessionWriteLuaHelpers');
    expect(source).toContain('prepareSessionWrite(sessionKey, session)');
    expect(source).toContain('writePreparedSessionPreservingTtl(sessionKey, encodedSession, ttl)');
    expect(source).not.toContain('local function prepareSessionWrite');
    expect(source).not.toContain("redis.call('PSETEX'");
    expect(source).not.toContain("redis.call('PTTL'");
  });

  it('즉시 입장과 대기열 head 승격 Lua 명령을 같은 Redis 인스턴스에 한 번만 등록함', async () => {
    const redis = createAdmissionCommandRedis();

    await runImmediateAdmissionLua(redis, {
      sessionKey: 'user:sid-1',
      eventId: 42,
      keys: admissionKeys,
      defaultMaxSize: 500,
      nowMs: 1_700_000_000_001,
    });
    await runWaitingHeadPromotionLua(redis, {
      waitingQueueKey: 'waiting-queue:42',
      userKeyPrefix: 'user:',
      eventId: 42,
      keys: admissionKeys,
      defaultMaxSize: 500,
      nowMs: 1_700_000_000_002,
    });
    await runImmediateAdmissionLua(redis, {
      sessionKey: 'user:sid-2',
      eventId: 42,
      keys: admissionKeys,
      defaultMaxSize: 500,
      nowMs: 1_700_000_000_003,
    });
    await runWaitingHeadPromotionLua(redis, {
      waitingQueueKey: 'waiting-queue:42',
      userKeyPrefix: 'user:',
      eventId: 42,
      keys: admissionKeys,
      defaultMaxSize: 500,
      nowMs: 1_700_000_000_004,
    });

    expect(redis.defineCommand).toHaveBeenCalledTimes(2);
    expect(redis.defineCommand).toHaveBeenCalledWith('admitBookingGateImmediate', {
      numberOfKeys: 5,
      lua: expect.stringContaining('local function hasAdmissionCapacity'),
    });
    expect(redis.defineCommand).toHaveBeenCalledWith('promoteWaitingQueueHead', {
      numberOfKeys: 6,
      lua: expect.stringContaining('local function hasAdmissionCapacity'),
    });
  });

  it('입장 Lua runner는 script-body eval 없이 path별 defineCommand 이름을 사용함', () => {
    const source = readFileSync(join(__dirname, 'admissionCapacityLua.ts'), 'utf8');

    expect(source).not.toMatch(/redis\.eval/);
    expect(source).toContain("redis.defineCommand('admitBookingGateImmediate'");
    expect(source).toContain("redis.defineCommand('promoteWaitingQueueHead'");
  });

  it('즉시 입장 runner는 앱에서 받은 nowMs를 entering zset score 인자로 전달함', async () => {
    const redis = createAdmissionCommandRedis();

    await runImmediateAdmissionLua(redis, {
      sessionKey: 'user:sid-1',
      eventId: 42,
      keys: admissionKeys,
      defaultMaxSize: 500,
      nowMs: 1_700_000_000_123,
    });

    expect(redis.admitBookingGateImmediate).toHaveBeenCalledWith(
      'user:sid-1',
      'entering:42',
      'in-booking:42:sessions',
      'reconnecting:42',
      'in-booking:42:max-size',
      '42',
      'in-booking:default-max-size',
      '500',
      '1700000000123',
      USER_STATUS.LOGIN,
      USER_STATUS.ENTERING,
    );
  });

  it('대기열 head 승격 runner는 앱에서 받은 nowMs를 entering zset score 인자로 전달함', async () => {
    const redis = createAdmissionCommandRedis();

    await runWaitingHeadPromotionLua(redis, {
      waitingQueueKey: 'waiting-queue:42',
      userKeyPrefix: 'user:',
      eventId: 42,
      keys: admissionKeys,
      defaultMaxSize: 500,
      nowMs: 1_700_000_000_456,
    });

    expect(redis.promoteWaitingQueueHead).toHaveBeenCalledWith(
      'waiting-queue:42',
      'entering:42',
      'in-booking:42:sessions',
      'reconnecting:42',
      'in-booking:42:max-size',
      'in-booking:default-max-size',
      '42',
      'user:',
      '500',
      '1700000000456',
      USER_STATUS.WAITING,
      USER_STATUS.ENTERING,
    );
  });

  it('Lua 모듈은 시각을 직접 읽지 않고 app-provided nowMs를 entering score로 사용함', () => {
    const source = readFileSync(join(__dirname, 'admissionCapacityLua.ts'), 'utf8');

    expect(source).toContain('local nowMs = tonumber(ARGV[4])');
    expect(source).toContain("redis.call('ZADD', enteringKey, nowMs,");
    expect(source).not.toContain("redis.call('TIME'");
    expect(source).not.toContain('redis.call("TIME"');
    expect(source).not.toContain('Date.now()');
  });

  it('즉시 입장 성공 경로는 entering zset 쓰기 이후 세션을 최종 저장함', () => {
    const source = readFileSync(join(__dirname, 'admissionCapacityLua.ts'), 'utf8');
    const immediateScriptStart = source.indexOf('export const immediateAdmissionLua');
    const zaddIndex = source.indexOf("redis.call('ZADD', enteringKey, nowMs, sid)", immediateScriptStart);
    const writeIndex = source.indexOf(
      'writePreparedSessionPreservingTtl(sessionKey, encodedSession, ttl)',
      immediateScriptStart,
    );

    expect(zaddIndex).toBeGreaterThan(immediateScriptStart);
    expect(writeIndex).toBeGreaterThan(zaddIndex);
  });

  it('즉시 입장 Lua는 capacity 판단 전에 세션 상태와 targetEvent를 검증함', () => {
    const source = readFileSync(join(__dirname, 'admissionCapacityLua.ts'), 'utf8');
    const immediateScriptStart = source.indexOf('export const immediateAdmissionLua');
    const sessionReadIndex = source.indexOf("redis.call('GET', sessionKey)", immediateScriptStart);
    const capacityIndex = source.indexOf('hasAdmissionCapacity(', immediateScriptStart);

    expect(sessionReadIndex).toBeGreaterThan(immediateScriptStart);
    expect(capacityIndex).toBeGreaterThan(sessionReadIndex);
  });

  it('대기열 head 승격 Lua는 head JSON을 먼저 해석해 깨진 queue item을 CAPACITY_FULL로 숨기지 않음', () => {
    const source = readFileSync(join(__dirname, 'admissionCapacityLua.ts'), 'utf8');
    const promotionScriptStart = source.indexOf('export const waitingHeadPromotionLua');
    const decodeIndex = source.indexOf('local item = cjson.decode(head)', promotionScriptStart);
    const capacityIndex = source.indexOf('hasAdmissionCapacity(', promotionScriptStart);

    expect(decodeIndex).toBeGreaterThan(promotionScriptStart);
    expect(capacityIndex).toBeGreaterThan(decodeIndex);
  });

  it('대기열 head 승격 성공 경로는 entering zset과 queue pop 이후 세션을 최종 저장함', () => {
    const source = readFileSync(join(__dirname, 'admissionCapacityLua.ts'), 'utf8');
    const promotionScriptStart = source.indexOf('export const waitingHeadPromotionLua');
    const zaddIndex = source.indexOf("redis.call('ZADD', enteringKey, nowMs, sid)", promotionScriptStart);
    const lpopIndex = source.indexOf("redis.call('LPOP', waitingQueueKey)", zaddIndex);
    const writeIndex = source.indexOf(
      'writePreparedSessionPreservingTtl(sessionKey, encodedSession, ttl)',
      promotionScriptStart,
    );

    expect(zaddIndex).toBeGreaterThan(promotionScriptStart);
    expect(lpopIndex).toBeGreaterThan(zaddIndex);
    expect(writeIndex).toBeGreaterThan(lpopIndex);
  });
});

describe('runImmediateAdmissionLua 즉시 입장 동작', () => {
  let redis: Redis;

  async function runImmediateAdmission(overrides: Partial<{ nowMs: number; defaultMaxSize: number }> = {}) {
    return runImmediateAdmissionLua(redis, {
      sessionKey: 'user:sid-1',
      eventId: 42,
      keys: admissionKeys,
      defaultMaxSize: overrides.defaultMaxSize ?? 500,
      nowMs: overrides.nowMs ?? 1_700_000_000_123,
    });
  }

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis;
    installAdmissionCommandStub(redis);
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it('성공 시 entering zset과 세션을 LOGIN에서 ENTERING으로 한 번에 갱신함', async () => {
    await redis.set('user:sid-1', JSON.stringify(baseSession), 'PX', 5000);
    const beforeTtl = await redis.pttl('user:sid-1');

    const result = await runImmediateAdmission();

    expect(result).toEqual({
      ok: true,
      code: 'OK',
      action: 'enterBookingGate',
      from: USER_STATUS.LOGIN,
      to: USER_STATUS.ENTERING,
    });
    expect(await redis.zscore('entering:42', 'sid-1')).toBe('1700000000123');
    expect(JSON.parse((await redis.get('user:sid-1')) ?? '{}')).toEqual({
      ...baseSession,
      targetEvent: 42,
      userStatus: USER_STATUS.ENTERING,
    });

    const afterTtl = await redis.pttl('user:sid-1');
    expect(beforeTtl).toBeGreaterThan(0);
    expect(afterTtl).toBeGreaterThan(0);
    expect(afterTtl).toBeLessThanOrEqual(beforeTtl);
  });

  it('정원이 가득 차면 세션과 entering zset을 변경하지 않고 CAPACITY_FULL을 반환함', async () => {
    await redis.set('user:sid-1', JSON.stringify(baseSession));
    await redis.hset('in-booking:42:sessions', 'occupied-sid', '{}');

    const result = await runImmediateAdmission({ defaultMaxSize: 1 });

    expect(result).toMatchObject({ ok: false, code: 'CAPACITY_FULL' });
    expect(await redis.zscore('entering:42', 'sid-1')).toBeNull();
    expect(JSON.parse((await redis.get('user:sid-1')) ?? '{}')).toEqual(baseSession);
  });

  it('세션이 없으면 SESSION_MISSING을 반환하고 entering zset을 변경하지 않음', async () => {
    const result = await runImmediateAdmission();

    expect(result).toMatchObject({ ok: false, code: 'SESSION_MISSING' });
    expect(await redis.zcard('entering:42')).toBe(0);
  });

  it('현재 상태가 LOGIN이 아니면 STATE_MISMATCH를 반환하고 쓰지 않음', async () => {
    const waitingSession = { ...baseSession, userStatus: USER_STATUS.WAITING };
    await redis.set('user:sid-1', JSON.stringify(waitingSession));

    const result = await runImmediateAdmission();

    expect(result).toMatchObject({ ok: false, code: 'STATE_MISMATCH' });
    expect(await redis.zscore('entering:42', 'sid-1')).toBeNull();
    expect(JSON.parse((await redis.get('user:sid-1')) ?? '{}')).toEqual(waitingSession);
  });

  it('이미 다른 targetEvent가 있으면 TARGET_EVENT_MISMATCH를 반환하고 쓰지 않음', async () => {
    const targetingSession = { ...baseSession, targetEvent: 99 };
    await redis.set('user:sid-1', JSON.stringify(targetingSession));

    const result = await runImmediateAdmission();

    expect(result).toMatchObject({ ok: false, code: 'TARGET_EVENT_MISMATCH' });
    expect(await redis.zscore('entering:42', 'sid-1')).toBeNull();
    expect(JSON.parse((await redis.get('user:sid-1')) ?? '{}')).toEqual(targetingSession);
  });

  it('깨진 세션 JSON은 typed business denial로 바꾸지 않고 인프라 실패로 throw함', async () => {
    await redis.set('user:sid-1', '{broken-json');

    await expect(runImmediateAdmission()).rejects.toThrow();
    expect(await redis.zscore('entering:42', 'sid-1')).toBeNull();
  });

  it('entering 키 타입이 깨져 ZADD가 실패하면 세션을 ENTERING으로 저장하지 않음', async () => {
    await redis.set('user:sid-1', JSON.stringify(baseSession));
    await redis.set('entering:42', 'wrong-type');

    await expect(runImmediateAdmission()).rejects.toThrow();
    expect(JSON.parse((await redis.get('user:sid-1')) ?? '{}')).toEqual(baseSession);
  });
});

describe('runWaitingHeadPromotionLua 대기열 head 승격 동작', () => {
  let redis: Redis;

  const waitingSession = {
    ...baseSession,
    targetEvent: 42,
    userStatus: USER_STATUS.WAITING,
  };

  async function runWaitingHeadPromotion(overrides: Partial<{ nowMs: number; defaultMaxSize: number }> = {}) {
    return runWaitingHeadPromotionLua(redis, {
      waitingQueueKey: 'waiting-queue:42',
      userKeyPrefix: 'user:',
      eventId: 42,
      keys: admissionKeys,
      defaultMaxSize: overrides.defaultMaxSize ?? 500,
      nowMs: overrides.nowMs ?? 1_700_000_000_456,
    });
  }

  async function pushQueueItems(...items: Array<{ sid: string; order: number }>) {
    for (const item of items) {
      await redis.rpush('waiting-queue:42', JSON.stringify(item));
    }
  }

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis;
    installAdmissionCommandStub(redis);
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it('성공 시 head만 pop하고 entering zset과 세션을 WAITING에서 ENTERING으로 갱신함', async () => {
    await pushQueueItems({ sid: 'sid-1', order: 7 }, { sid: 'sid-2', order: 8 });
    await redis.set('user:sid-1', JSON.stringify(waitingSession), 'PX', 5000);
    const beforeTtl = await redis.pttl('user:sid-1');

    const result = await runWaitingHeadPromotion();

    expect(result).toEqual({
      ok: true,
      code: 'OK',
      action: 'enterBookingGate',
      from: USER_STATUS.WAITING,
      to: USER_STATUS.ENTERING,
    });
    expect(await redis.lrange('waiting-queue:42', 0, -1)).toEqual([
      JSON.stringify({ sid: 'sid-2', order: 8 }),
    ]);
    expect(await redis.zscore('entering:42', 'sid-1')).toBe('1700000000456');
    expect(JSON.parse((await redis.get('user:sid-1')) ?? '{}')).toEqual({
      ...waitingSession,
      userStatus: USER_STATUS.ENTERING,
    });

    const afterTtl = await redis.pttl('user:sid-1');
    expect(beforeTtl).toBeGreaterThan(0);
    expect(afterTtl).toBeGreaterThan(0);
    expect(afterTtl).toBeLessThanOrEqual(beforeTtl);
  });

  it('대기열이 비어 있으면 QUEUE_EMPTY를 반환하고 queue와 entering을 변경하지 않음', async () => {
    const result = await runWaitingHeadPromotion();

    expect(result).toMatchObject({ ok: false, code: 'QUEUE_EMPTY' });
    expect(await redis.llen('waiting-queue:42')).toBe(0);
    expect(await redis.zcard('entering:42')).toBe(0);
  });

  it('정원이 가득 차면 head와 세션을 보존하고 CAPACITY_FULL을 반환함', async () => {
    const head = { sid: 'sid-1', order: 7 };
    await pushQueueItems(head);
    await redis.set('user:sid-1', JSON.stringify(waitingSession));
    await redis.hset('in-booking:42:sessions', 'occupied-sid', '{}');

    const result = await runWaitingHeadPromotion({ defaultMaxSize: 1 });

    expect(result).toMatchObject({ ok: false, code: 'CAPACITY_FULL' });
    expect(await redis.lrange('waiting-queue:42', 0, -1)).toEqual([JSON.stringify(head)]);
    expect(await redis.zscore('entering:42', 'sid-1')).toBeNull();
    expect(JSON.parse((await redis.get('user:sid-1')) ?? '{}')).toEqual(waitingSession);
  });

  it('head 세션이 없으면 stale head만 제거하고 다음 후보를 남김', async () => {
    await pushQueueItems({ sid: 'sid-1', order: 7 }, { sid: 'sid-2', order: 8 });

    const result = await runWaitingHeadPromotion();

    expect(result).toMatchObject({
      ok: false,
      code: 'STALE_SESSION_MISSING',
      details: ['sid-1'],
    });
    expect(await redis.lrange('waiting-queue:42', 0, -1)).toEqual([
      JSON.stringify({ sid: 'sid-2', order: 8 }),
    ]);
  });

  it('head 세션 상태가 WAITING이 아니면 stale head만 제거함', async () => {
    await pushQueueItems({ sid: 'sid-1', order: 7 }, { sid: 'sid-2', order: 8 });
    await redis.set('user:sid-1', JSON.stringify(baseSession));

    const result = await runWaitingHeadPromotion();

    expect(result).toMatchObject({
      ok: false,
      code: 'STALE_STATE_MISMATCH',
      details: [USER_STATUS.LOGIN],
    });
    expect(await redis.lrange('waiting-queue:42', 0, -1)).toEqual([
      JSON.stringify({ sid: 'sid-2', order: 8 }),
    ]);
  });

  it('head 세션 targetEvent가 다르면 stale head만 제거함', async () => {
    await pushQueueItems({ sid: 'sid-1', order: 7 }, { sid: 'sid-2', order: 8 });
    await redis.set('user:sid-1', JSON.stringify({ ...waitingSession, targetEvent: 99 }));

    const result = await runWaitingHeadPromotion();

    expect(result).toMatchObject({
      ok: false,
      code: 'STALE_TARGET_EVENT_MISMATCH',
      details: [99],
    });
    expect(await redis.lrange('waiting-queue:42', 0, -1)).toEqual([
      JSON.stringify({ sid: 'sid-2', order: 8 }),
    ]);
  });

  it('깨진 queue item JSON은 typed business denial로 바꾸지 않고 queue head를 보존함', async () => {
    await redis.rpush('waiting-queue:42', '{broken-json');
    await redis.hset('in-booking:42:sessions', 'occupied-sid', '{}');

    await expect(runWaitingHeadPromotion({ defaultMaxSize: 1 })).rejects.toThrow();
    expect(await redis.lindex('waiting-queue:42', 0)).toBe('{broken-json');
    expect(await redis.zcard('entering:42')).toBe(0);
  });

  it('깨진 세션 JSON은 typed business denial로 바꾸지 않고 queue head를 보존함', async () => {
    const head = { sid: 'sid-1', order: 7 };
    await pushQueueItems(head);
    await redis.set('user:sid-1', '{broken-json');

    await expect(runWaitingHeadPromotion()).rejects.toThrow();
    expect(await redis.lindex('waiting-queue:42', 0)).toBe(JSON.stringify(head));
    expect(await redis.zcard('entering:42')).toBe(0);
  });

  it('entering 키 타입이 깨져 ZADD가 실패하면 queue head와 세션을 보존함', async () => {
    const head = { sid: 'sid-1', order: 7 };
    await pushQueueItems(head);
    await redis.set('user:sid-1', JSON.stringify(waitingSession));
    await redis.set('entering:42', 'wrong-type');

    await expect(runWaitingHeadPromotion()).rejects.toThrow();
    expect(await redis.lindex('waiting-queue:42', 0)).toBe(JSON.stringify(head));
    expect(JSON.parse((await redis.get('user:sid-1')) ?? '{}')).toEqual(waitingSession);
  });
});

describe('admissionCapacityLua 전이 출처', () => {
  it('from/to를 스크립트에 적어두지 않고 FSM 전이 테이블에서 유도함', () => {
    expect(USER_STATE_TRANSITIONS).toContainEqual(IMMEDIATE_ADMISSION_TRANSITION);
    expect(USER_STATE_TRANSITIONS).toContainEqual(WAITING_HEAD_PROMOTION_TRANSITION);
    expect(IMMEDIATE_ADMISSION_TRANSITION.from).toBe(USER_STATUS.LOGIN);
    expect(WAITING_HEAD_PROMOTION_TRANSITION.from).toBe(USER_STATUS.WAITING);
  });

  it('Lua 본문에 상태 문자열을 박아두지 않고 ARGV로 받음', () => {
    for (const script of [immediateAdmissionLua, waitingHeadPromotionLua]) {
      expect(script).toContain('local expectedFrom = ARGV[5]');
      expect(script).toContain('local nextTo = ARGV[6]');
      expect(script).toContain('session.userStatus ~= expectedFrom');
      expect(script).toContain('session.userStatus = nextTo');
      for (const state of Object.values(USER_STATUS)) {
        expect(script).not.toContain(`'${state}'`);
      }
    }
  });
});
