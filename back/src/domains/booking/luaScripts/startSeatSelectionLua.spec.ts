import { readFileSync } from 'fs';
import { join } from 'path';

import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { USER_STATUS } from '../../../auth/fsm/user-state.fsm';
import { installStartSeatSelectionCommandMock } from '../../../testing/redis/start-seat-selection-command-mock';

import {
  buildInBookingSessionFragments,
  runStartSeatSelectionLua,
  startSeatSelectionLua,
} from './startSeatSelectionLua';

const EVENT_ID = 42;
const SID = 'sid-1';
const SESSION_KEY = `user:${SID}`;
const ENTERING_KEY = `entering:${EVENT_ID}`;
const IN_BOOKING_KEY = `in-booking:${EVENT_ID}:sessions`;
const AMOUNT_KEY = `entering:${SID}:temp-booking-amount`;

const enteringSession = {
  id: 1,
  loginId: 'guest-1',
  roles: ['USER'],
  targetEvent: EVENT_ID,
  userStatus: USER_STATUS.ENTERING,
};

const startInput = {
  sessionKey: SESSION_KEY,
  enteringKey: ENTERING_KEY,
  inBookingSessionsKey: IN_BOOKING_KEY,
  bookingAmountKey: AMOUNT_KEY,
  eventId: EVENT_ID,
  sid: SID,
};

/** 운영 Lua와 같은 계약을 emulate하는 테스트용 command mock을 그대로 사용함. */
function createCommandRedis(): Redis {
  const redis = new RedisMock() as unknown as Redis;
  installStartSeatSelectionCommandMock(redis);
  return redis;
}

async function readInBookingSession(redis: Redis): Promise<Record<string, unknown> | null> {
  const raw = await redis.hget(IN_BOOKING_KEY, SID);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

describe('in-booking 세션 JSON 조각', () => {
  it('예매 수량을 끼워 넣으면 기존 in-booking 세션 형태와 같아짐', () => {
    const { prefix, suffix } = buildInBookingSessionFragments(SID);

    expect(JSON.parse(`${prefix}3${suffix}`)).toEqual({
      sid: SID,
      bookingAmount: 3,
      bookedSeats: [],
      saved: false,
      subscribedSection: null,
    });
  });

  it('빈 좌석 목록이 객체가 아니라 배열로 직렬화됨', () => {
    const { prefix, suffix } = buildInBookingSessionFragments(SID);
    const parsed = JSON.parse(`${prefix}0${suffix}`) as { bookedSeats: unknown };

    expect(Array.isArray(parsed.bookedSeats)).toBe(true);
  });

  it('따옴표가 필요한 sid도 안전하게 직렬화됨', () => {
    const { prefix, suffix } = buildInBookingSessionFragments('sid"with\\quote');
    const parsed = JSON.parse(`${prefix}0${suffix}`) as { sid: string };

    expect(parsed.sid).toBe('sid"with\\quote');
  });
});

describe('좌석 선택 진입 Lua 실행', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = createCommandRedis();
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it('세션이 없으면 SESSION_MISSING을 반환하고 in-booking에 넣지 않음', async () => {
    const result = await runStartSeatSelectionLua(redis, startInput);

    expect(result).toMatchObject({ ok: false, code: 'SESSION_MISSING' });
    expect(await readInBookingSession(redis)).toBeNull();
  });

  it('ENTERING이 아니면 STATE_MISMATCH를 반환하고 entering 풀을 건드리지 않음', async () => {
    await redis.set(
      SESSION_KEY,
      JSON.stringify({ ...enteringSession, userStatus: USER_STATUS.SELECTING_SEAT }),
    );
    await redis.zadd(ENTERING_KEY, 1, SID);

    const result = await runStartSeatSelectionLua(redis, startInput);

    expect(result).toMatchObject({ ok: false, code: 'STATE_MISMATCH' });
    expect(await redis.zscore(ENTERING_KEY, SID)).not.toBeNull();
    expect(await readInBookingSession(redis)).toBeNull();
  });

  it('entering 풀 멤버가 아니면 NOT_ENTERING을 반환하고 아무것도 쓰지 않음', async () => {
    await redis.set(SESSION_KEY, JSON.stringify(enteringSession));
    await redis.set(AMOUNT_KEY, '2');

    const result = await runStartSeatSelectionLua(redis, startInput);

    expect(result).toMatchObject({ ok: false, code: 'NOT_ENTERING' });
    expect(await readInBookingSession(redis)).toBeNull();
    expect(await redis.get(AMOUNT_KEY)).toBe('2');
    expect(JSON.parse((await redis.get(SESSION_KEY)) ?? '{}')).toMatchObject({
      userStatus: USER_STATUS.ENTERING,
    });
  });

  it('성공하면 entering 제거, 임시 수량 삭제, in-booking 생성, 상태 전이를 함께 반영함', async () => {
    await redis.set(SESSION_KEY, JSON.stringify(enteringSession));
    await redis.zadd(ENTERING_KEY, 1, SID);
    await redis.set(AMOUNT_KEY, '3');

    const result = await runStartSeatSelectionLua(redis, startInput);

    expect(result).toMatchObject({ ok: true, code: 'OK', to: USER_STATUS.SELECTING_SEAT });
    expect(await redis.zscore(ENTERING_KEY, SID)).toBeNull();
    expect(await redis.get(AMOUNT_KEY)).toBeNull();
    expect(await readInBookingSession(redis)).toEqual({
      sid: SID,
      bookingAmount: 3,
      bookedSeats: [],
      saved: false,
      subscribedSection: null,
    });
    expect(JSON.parse((await redis.get(SESSION_KEY)) ?? '{}')).toMatchObject({
      userStatus: USER_STATUS.SELECTING_SEAT,
    });
  });

  it('임시 예매 수량이 없으면 0으로 in-booking 세션을 만듦', async () => {
    await redis.set(SESSION_KEY, JSON.stringify(enteringSession));
    await redis.zadd(ENTERING_KEY, 1, SID);

    await runStartSeatSelectionLua(redis, startInput);

    expect(await readInBookingSession(redis)).toMatchObject({ bookingAmount: 0 });
  });

  it('임시 예매 수량이 숫자가 아니면 업무 거부가 아니라 throw로 드러남', async () => {
    await redis.set(SESSION_KEY, JSON.stringify(enteringSession));
    await redis.zadd(ENTERING_KEY, 1, SID);
    await redis.set(AMOUNT_KEY, 'not-a-number');

    await expect(runStartSeatSelectionLua(redis, startInput)).rejects.toThrow(TypeError);
  });

  it('성공해도 세션 TTL을 갱신하지 않고 남은 시간을 보존함', async () => {
    await redis.set(SESSION_KEY, JSON.stringify(enteringSession), 'PX', 60_000);
    await redis.zadd(ENTERING_KEY, 1, SID);

    await runStartSeatSelectionLua(redis, startInput);

    const ttl = await redis.pttl(SESSION_KEY);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });
});

describe('좌석 선택 진입 Lua 정적 계약', () => {
  it('in-booking 세션 JSON을 cjson으로 만들지 않아 빈 배열 인코딩 문제를 피함', () => {
    expect(startSeatSelectionLua).not.toContain('cjson.encode({');
    expect(startSeatSelectionLua).toContain(
      'inBookingSessionPrefix .. bookingAmount .. inBookingSessionSuffix',
    );
  });

  it('상태 문자열을 FSM 상수에서 주입해 literal 드리프트를 막음', () => {
    expect(startSeatSelectionLua).toContain(`session.userStatus ~= '${USER_STATUS.ENTERING}'`);
    expect(startSeatSelectionLua).toContain(`session.userStatus = '${USER_STATUS.SELECTING_SEAT}'`);
  });

  it('entering 멤버십을 ZREM 반환값으로 확인해 별도 조회를 하지 않음', () => {
    expect(startSeatSelectionLua).toContain("if redis.call('ZREM', enteringKey, sid) ~= 1 then");
    expect(startSeatSelectionLua).not.toContain('ZSCORE');
  });

  it('멤버십 확인 실패 시 예매 수량 키와 in-booking 해시를 건드리지 않음', () => {
    const zremIndex = startSeatSelectionLua.indexOf("redis.call('ZREM', enteringKey");
    const delIndex = startSeatSelectionLua.indexOf("redis.call('DEL', bookingAmountKey)");
    const hsetIndex = startSeatSelectionLua.indexOf("'HSET',");

    expect(zremIndex).toBeGreaterThan(-1);
    expect(delIndex).toBeGreaterThan(zremIndex);
    expect(hsetIndex).toBeGreaterThan(zremIndex);
  });

  it('세션 쓰기는 예매 자료구조 변경 뒤에 마지막으로 수행함', () => {
    // 공용 helper 정의가 앞에 붙으므로 호출 지점은 마지막 등장 위치로 찾음.
    const hsetIndex = startSeatSelectionLua.indexOf("'HSET',");
    const writeIndex = startSeatSelectionLua.lastIndexOf('writePreparedSessionPreservingTtl(sessionKey');

    expect(writeIndex).toBeGreaterThan(hsetIndex);
  });

  it('스크립트 본문 직접 eval 대신 script cache 명령으로 등록함', () => {
    const source = readFileSync(join(__dirname, 'startSeatSelectionLua.ts'), 'utf8');

    expect(source).not.toMatch(/redis\.eval\(/);
    expect(source).toContain("redis.defineCommand('startSeatSelectionFromEntering'");
    expect(source).toContain('numberOfKeys: 4');
  });
});
