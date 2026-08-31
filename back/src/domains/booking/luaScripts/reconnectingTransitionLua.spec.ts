import { readFileSync } from 'fs';
import { join } from 'path';

import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { USER_STATUS } from '../../../auth/fsm/user-state.fsm';
import { installReconnectingTransitionCommandMock } from '../../../testing/redis/reconnecting-transition-command-mock';

import {
  mapMarkReconnectingLuaResult,
  mapRestoreSelectingLuaResult,
  markReconnectingLua,
  restoreSelectingLua,
  runMarkReconnectingLua,
  runRestoreSelectingLua,
} from './reconnectingTransitionLua';

const EVENT_ID = 42;
const SID = 'sid-1';
const SESSION_KEY = `user:${SID}`;
const RECONNECTING_KEY = `reconnecting:${EVENT_ID}`;

const baseSession = {
  id: 1,
  loginId: 'guest-1',
  roles: ['USER'],
  targetEvent: EVENT_ID,
  userStatus: USER_STATUS.SELECTING_SEAT,
};

const markInput = {
  sessionKey: SESSION_KEY,
  reconnectingKey: RECONNECTING_KEY,
  eventId: EVENT_ID,
  sid: SID,
  nowMs: 1_700_000_000_000,
};

const restoreInput = {
  sessionKey: SESSION_KEY,
  reconnectingKey: RECONNECTING_KEY,
  eventId: EVENT_ID,
  sid: SID,
};

/** 운영 Lua와 같은 계약을 emulate하는 테스트용 command mock을 그대로 사용함. */
function createCommandRedis(): Redis {
  const redis = new RedisMock() as unknown as Redis;
  installReconnectingTransitionCommandMock(redis);
  return redis;
}

async function readSession(redis: Redis): Promise<Record<string, unknown> | null> {
  const raw = await redis.get(SESSION_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

describe('재연결 표시 Lua 실행', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = createCommandRedis();
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it('세션이 없으면 SESSION_MISSING을 반환하고 재연결 풀을 건드리지 않음', async () => {
    const result = await runMarkReconnectingLua(redis, markInput);

    expect(result).toMatchObject({ ok: false, code: 'SESSION_MISSING' });
    expect(await redis.zscore(RECONNECTING_KEY, SID)).toBeNull();
  });

  it('SELECTING_SEAT가 아니면 STATE_MISMATCH를 반환하고 세션과 재연결 풀을 그대로 둠', async () => {
    const session = { ...baseSession, userStatus: USER_STATUS.ENTERING };
    await redis.set(SESSION_KEY, JSON.stringify(session));

    const result = await runMarkReconnectingLua(redis, markInput);

    expect(result).toMatchObject({ ok: false, code: 'STATE_MISMATCH' });
    expect(await readSession(redis)).toEqual(session);
    expect(await redis.zscore(RECONNECTING_KEY, SID)).toBeNull();
  });

  it('세션이 다른 이벤트를 보고 있으면 TARGET_EVENT_MISMATCH를 반환함', async () => {
    const session = { ...baseSession, targetEvent: 99 };
    await redis.set(SESSION_KEY, JSON.stringify(session));

    const result = await runMarkReconnectingLua(redis, markInput);

    expect(result).toMatchObject({ ok: false, code: 'TARGET_EVENT_MISMATCH' });
    expect(await redis.zscore(RECONNECTING_KEY, SID)).toBeNull();
  });

  it('성공하면 재연결 풀 등록과 상태 전이를 함께 반영함', async () => {
    await redis.set(SESSION_KEY, JSON.stringify(baseSession));

    const result = await runMarkReconnectingLua(redis, markInput);

    expect(result).toMatchObject({ ok: true, code: 'OK', to: USER_STATUS.RECONNECTING_SELECTING });
    expect(await readSession(redis)).toMatchObject({
      userStatus: USER_STATUS.RECONNECTING_SELECTING,
      targetEvent: EVENT_ID,
    });
    expect(Number(await redis.zscore(RECONNECTING_KEY, SID))).toBe(markInput.nowMs);
  });

  it('성공해도 세션 TTL을 갱신하지 않고 남은 시간을 보존함', async () => {
    await redis.set(SESSION_KEY, JSON.stringify(baseSession), 'PX', 60_000);

    await runMarkReconnectingLua(redis, markInput);

    const ttl = await redis.pttl(SESSION_KEY);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });
});

describe('재연결 복원 Lua 실행', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = createCommandRedis();
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it('재연결 풀 멤버면 풀에서 제거하고 SELECTING_SEAT로 되돌림', async () => {
    await redis.set(
      SESSION_KEY,
      JSON.stringify({ ...baseSession, userStatus: USER_STATUS.RECONNECTING_SELECTING }),
    );
    await redis.zadd(RECONNECTING_KEY, 1, SID);

    const result = await runRestoreSelectingLua(redis, restoreInput);

    expect(result).toMatchObject({ ok: true, code: 'OK', to: USER_STATUS.SELECTING_SEAT });
    expect(await readSession(redis)).toMatchObject({ userStatus: USER_STATUS.SELECTING_SEAT });
    expect(await redis.zscore(RECONNECTING_KEY, SID)).toBeNull();
  });

  it('재연결 풀에 없으면 NOT_RECONNECTING을 반환하고 상태를 전이하지 않음', async () => {
    const session = { ...baseSession, userStatus: USER_STATUS.RECONNECTING_SELECTING };
    await redis.set(SESSION_KEY, JSON.stringify(session));

    const result = await runRestoreSelectingLua(redis, restoreInput);

    expect(result).toMatchObject({ ok: false, code: 'NOT_RECONNECTING' });
    expect(await readSession(redis)).toEqual(session);
  });

  it('RECONNECTING_SELECTING이 아니면 재연결 풀을 건드리지 않고 STATE_MISMATCH를 반환함', async () => {
    await redis.set(SESSION_KEY, JSON.stringify(baseSession));
    await redis.zadd(RECONNECTING_KEY, 1, SID);

    const result = await runRestoreSelectingLua(redis, restoreInput);

    expect(result).toMatchObject({ ok: false, code: 'STATE_MISMATCH' });
    expect(await redis.zscore(RECONNECTING_KEY, SID)).not.toBeNull();
  });
});

describe('재연결 전이 Lua 결과 매핑', () => {
  it('표시 결과는 SELECTING_SEAT에서 RECONNECTING_SELECTING 전이로 해석함', () => {
    expect(mapMarkReconnectingLuaResult(['OK'])).toEqual({
      ok: true,
      code: 'OK',
      action: 'markReconnectingSelection',
      from: USER_STATUS.SELECTING_SEAT,
      to: USER_STATUS.RECONNECTING_SELECTING,
    });
  });

  it('복원 결과는 RECONNECTING_SELECTING에서 SELECTING_SEAT 전이로 해석함', () => {
    expect(mapRestoreSelectingLuaResult(['OK'])).toEqual({
      ok: true,
      code: 'OK',
      action: 'restoreSeatSelection',
      from: USER_STATUS.RECONNECTING_SELECTING,
      to: USER_STATUS.SELECTING_SEAT,
    });
  });

  it('선언하지 않은 결과 코드는 업무 거부로 위장하지 않고 throw함', () => {
    expect(() => mapMarkReconnectingLuaResult(['NOT_RECONNECTING' as never])).toThrow(TypeError);
    expect(() => mapRestoreSelectingLuaResult(['UNDECLARED' as never])).toThrow(TypeError);
  });
});

describe('재연결 전이 Lua 정적 계약', () => {
  it('상태 문자열을 FSM 상수에서 주입해 literal 드리프트를 막음', () => {
    expect(markReconnectingLua).toContain(`session.userStatus ~= '${USER_STATUS.SELECTING_SEAT}'`);
    expect(markReconnectingLua).toContain(`session.userStatus = '${USER_STATUS.RECONNECTING_SELECTING}'`);
    expect(restoreSelectingLua).toContain(`session.userStatus ~= '${USER_STATUS.RECONNECTING_SELECTING}'`);
    expect(restoreSelectingLua).toContain(`session.userStatus = '${USER_STATUS.SELECTING_SEAT}'`);
  });

  it('세션 쓰기 전에 재연결 풀 변경을 끝내 부분 반영을 만들지 않음', () => {
    // 공용 helper 정의가 앞에 붙으므로 호출 지점은 마지막 등장 위치로 찾음.
    const markZaddIndex = markReconnectingLua.indexOf("redis.call('ZADD', reconnectingKey");
    const markWriteIndex = markReconnectingLua.lastIndexOf('writePreparedSessionPreservingTtl(sessionKey');
    expect(markZaddIndex).toBeGreaterThan(-1);
    expect(markWriteIndex).toBeGreaterThan(markZaddIndex);

    const restoreZremIndex = restoreSelectingLua.indexOf("redis.call('ZREM', reconnectingKey");
    const restoreWriteIndex = restoreSelectingLua.lastIndexOf('writePreparedSessionPreservingTtl(sessionKey');
    expect(restoreZremIndex).toBeGreaterThan(-1);
    expect(restoreWriteIndex).toBeGreaterThan(restoreZremIndex);
  });

  it('복원은 ZREM 반환값으로 멤버십을 확인해 별도 조회를 하지 않음', () => {
    expect(restoreSelectingLua).toContain("if redis.call('ZREM', reconnectingKey, sid) ~= 1 then");
    expect(restoreSelectingLua).not.toContain('ZSCORE');
  });

  it('TTL 보존 쓰기를 자체 구현하지 않고 공용 helper에 위임함', () => {
    const source = readFileSync(join(__dirname, 'reconnectingTransitionLua.ts'), 'utf8');

    expect(source).toContain('sessionWriteLuaHelpers');
    expect(source).not.toContain('local function prepareSessionWrite');
    expect(source).not.toContain("redis.call('PSETEX'");
    expect(source).not.toContain("redis.call('PTTL'");
  });

  it('스크립트 본문 직접 eval 대신 script cache 명령으로 등록함', () => {
    const source = readFileSync(join(__dirname, 'reconnectingTransitionLua.ts'), 'utf8');

    expect(source).not.toMatch(/redis\.eval\(/);
    expect(source).toContain("redis.defineCommand('markReconnectingSelecting'");
    expect(source).toContain("redis.defineCommand('restoreSelectingSeat'");
    expect(source).toContain('numberOfKeys: 2');
  });
});
