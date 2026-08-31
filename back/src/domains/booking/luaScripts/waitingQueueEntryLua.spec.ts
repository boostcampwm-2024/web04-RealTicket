import { readFileSync } from 'fs';
import { join } from 'path';

import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { USER_STATE_TRANSITIONS, USER_STATUS } from '../../../auth/fsm/user-state.fsm';
import { installWaitingQueueEntryCommandMock } from '../../../testing/redis/waiting-queue-entry-command-mock';

import {
  ENTER_WAITING_TRANSITION,
  mapWaitingQueueEntryLuaResult,
  runWaitingQueueEntryLua,
  waitingQueueEntryLua,
} from './waitingQueueEntryLua';

const EVENT_ID = 42;
const SID = 'sid-1';
const SESSION_KEY = `user:${SID}`;
const QUEUE_KEY = `waiting-queue:${EVENT_ID}`;
const ORDER_KEY = `waiting-queue:${EVENT_ID}:order`;

const loginSession = {
  id: 1,
  loginId: 'guest-1',
  roles: ['USER'],
  targetEvent: null,
  userStatus: USER_STATUS.LOGIN,
};

const entryInput = {
  sessionKey: SESSION_KEY,
  waitingQueueKey: QUEUE_KEY,
  waitingOrderKey: ORDER_KEY,
  eventId: EVENT_ID,
  sid: SID,
};

/** 운영 Lua와 같은 계약을 emulate하는 테스트용 command mock을 그대로 사용함. */
function createCommandRedis(): Redis {
  const redis = new RedisMock() as unknown as Redis;
  installWaitingQueueEntryCommandMock(redis);
  return redis;
}

describe('대기열 진입 Lua 실행', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = createCommandRedis();
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it('세션이 없으면 SESSION_MISSING을 반환하고 순번을 발급하지 않음', async () => {
    const { transition, order } = await runWaitingQueueEntryLua(redis, entryInput);

    expect(transition).toMatchObject({ ok: false, code: 'SESSION_MISSING' });
    expect(order).toBeNull();
    expect(await redis.get(ORDER_KEY)).toBeNull();
    expect(await redis.llen(QUEUE_KEY)).toBe(0);
  });

  it('LOGIN이 아니면 STATE_MISMATCH를 반환하고 큐를 건드리지 않음', async () => {
    await redis.set(SESSION_KEY, JSON.stringify({ ...loginSession, userStatus: USER_STATUS.WAITING }));

    const { transition, order } = await runWaitingQueueEntryLua(redis, entryInput);

    expect(transition).toMatchObject({ ok: false, code: 'STATE_MISMATCH' });
    expect(order).toBeNull();
    expect(await redis.llen(QUEUE_KEY)).toBe(0);
  });

  it('이미 다른 이벤트를 보고 있으면 TARGET_EVENT_MISMATCH를 반환함', async () => {
    await redis.set(SESSION_KEY, JSON.stringify({ ...loginSession, targetEvent: 7 }));

    const { transition, order } = await runWaitingQueueEntryLua(redis, entryInput);

    expect(transition).toMatchObject({ ok: false, code: 'TARGET_EVENT_MISMATCH' });
    expect(order).toBeNull();
    expect(await redis.llen(QUEUE_KEY)).toBe(0);
  });

  it('성공하면 순번 발급, 큐 적재, 상태 전이를 함께 반영함', async () => {
    await redis.set(SESSION_KEY, JSON.stringify(loginSession));

    const { transition, order } = await runWaitingQueueEntryLua(redis, entryInput);

    expect(transition).toMatchObject({ ok: true, code: 'OK', to: USER_STATUS.WAITING });
    expect(order).toBe(1);
    expect(JSON.parse((await redis.lindex(QUEUE_KEY, 0)) ?? '{}')).toEqual({ sid: SID, order: 1 });
    expect(JSON.parse((await redis.get(SESSION_KEY)) ?? '{}')).toMatchObject({
      userStatus: USER_STATUS.WAITING,
      targetEvent: EVENT_ID,
      waitingOrder: 1,
    });
  });

  it('여러 사용자가 진입해도 순번이 겹치지 않고 증가함', async () => {
    const orders: Array<number | null> = [];

    for (const sid of ['sid-1', 'sid-2', 'sid-3']) {
      await redis.set(`user:${sid}`, JSON.stringify(loginSession));
      const { order } = await runWaitingQueueEntryLua(redis, {
        ...entryInput,
        sessionKey: `user:${sid}`,
        sid,
      });
      orders.push(order);
    }

    expect(orders).toEqual([1, 2, 3]);
    expect(await redis.llen(QUEUE_KEY)).toBe(3);
  });

  it('성공해도 세션 TTL을 갱신하지 않고 남은 시간을 보존함', async () => {
    await redis.set(SESSION_KEY, JSON.stringify(loginSession), 'PX', 60_000);

    await runWaitingQueueEntryLua(redis, entryInput);

    const ttl = await redis.pttl(SESSION_KEY);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });
});

describe('대기열 진입 Lua 결과 매핑', () => {
  it('성공 결과에서 순번을 함께 꺼냄', () => {
    expect(mapWaitingQueueEntryLuaResult(['OK', 12])).toEqual({
      transition: {
        ok: true,
        code: 'OK',
        action: 'enterWaiting',
        from: USER_STATUS.LOGIN,
        to: USER_STATUS.WAITING,
      },
      order: 12,
    });
  });

  it('성공인데 순번이 없으면 조용히 넘기지 않고 throw함', () => {
    expect(() => mapWaitingQueueEntryLuaResult(['OK'])).toThrow(TypeError);
  });

  it('거부 결과는 순번 없이 전달함', () => {
    expect(mapWaitingQueueEntryLuaResult(['STATE_MISMATCH', USER_STATUS.WAITING])).toMatchObject({
      transition: { ok: false, code: 'STATE_MISMATCH' },
      order: null,
    });
  });
});

describe('대기열 진입 Lua 정적 계약', () => {
  it('순번을 INCR로 발급해 전역 카운터 read-modify-write를 만들지 않음', () => {
    expect(waitingQueueEntryLua).toContain("redis.call('INCR', waitingOrderKey)");
    expect(waitingQueueEntryLua).not.toContain("redis.call('SET', waitingOrderKey");
    expect(waitingQueueEntryLua).not.toContain("redis.call('GET', waitingOrderKey)");
  });

  it('from/to를 스크립트에 적어두지 않고 FSM 전이 테이블에서 유도함', () => {
    expect(USER_STATE_TRANSITIONS).toContainEqual(ENTER_WAITING_TRANSITION);
    expect(ENTER_WAITING_TRANSITION.from).toBe(USER_STATUS.LOGIN);
  });

  it('Lua 본문에 상태 문자열을 박아두지 않고 ARGV로 받음', () => {
    expect(waitingQueueEntryLua).toContain('session.userStatus ~= expectedFrom');
    expect(waitingQueueEntryLua).toContain('session.userStatus = nextTo');
    for (const state of Object.values(USER_STATUS)) {
      expect(waitingQueueEntryLua).not.toContain(`'${state}'`);
    }
  });

  it('세션 쓰기 전에 큐 적재를 끝내 부분 반영을 만들지 않음', () => {
    // 공용 helper 정의가 앞에 붙으므로 호출 지점은 마지막 등장 위치로 찾음.
    const rpushIndex = waitingQueueEntryLua.indexOf("redis.call('RPUSH', waitingQueueKey");
    const writeIndex = waitingQueueEntryLua.lastIndexOf('writePreparedSessionPreservingTtl(sessionKey');

    expect(rpushIndex).toBeGreaterThan(-1);
    expect(writeIndex).toBeGreaterThan(rpushIndex);
  });

  it('발급한 순번을 세션에도 남겨 조회가 큐 전체 스캔에 의존하지 않게 함', () => {
    expect(waitingQueueEntryLua).toContain('session.waitingOrder = order');
  });

  it('TTL 보존 쓰기를 자체 구현하지 않고 공용 helper에 위임함', () => {
    const source = readFileSync(join(__dirname, 'waitingQueueEntryLua.ts'), 'utf8');

    expect(source).toContain('sessionWriteLuaHelpers');
    expect(source).not.toContain('local function prepareSessionWrite');
    expect(source).not.toContain("redis.call('PSETEX'");
  });

  it('스크립트 본문 직접 eval 대신 script cache 명령으로 등록함', () => {
    const source = readFileSync(join(__dirname, 'waitingQueueEntryLua.ts'), 'utf8');

    expect(source).not.toMatch(/redis\.eval\(/);
    expect(source).toContain("redis.defineCommand('enterWaitingQueue'");
    expect(source).toContain('numberOfKeys: 3');
  });
});
