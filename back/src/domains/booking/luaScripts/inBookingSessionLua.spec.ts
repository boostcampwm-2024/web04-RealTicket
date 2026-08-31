import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { installInBookingSessionCommandMock } from '../../../testing/redis/in-booking-session-command-mock';

import {
  addBookedSeatLua,
  flushBookedSeatsLua,
  inBookingSessionLuaHelpers,
  removeBookedSeatLua,
  runAddBookedSeatLua,
  runFlushBookedSeatsLua,
  runRemoveBookedSeatLua,
  runSetInBookingSavedLua,
  runSetSubscribedSectionLua,
  setInBookingSavedLua,
  setSubscribedSectionLua,
  type Seat,
} from './inBookingSessionLua';

const EVENT_ID = 42;
const SID = 'sid-1';
const IN_BOOKING_KEY = `in-booking:${EVENT_ID}:sessions`;

function inBookingSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sid: SID,
    bookingAmount: 2,
    bookedSeats: [] as Seat[],
    saved: false,
    subscribedSection: null,
    ...overrides,
  };
}

/** 운영 Lua와 같은 계약을 emulate하는 테스트용 command mock을 그대로 사용함. */
function createCommandRedis(): Redis {
  const redis = new RedisMock() as unknown as Redis;
  installInBookingSessionCommandMock(redis);
  return redis;
}

async function seedSession(redis: Redis, overrides: Partial<Record<string, unknown>> = {}) {
  await redis.hset(IN_BOOKING_KEY, SID, JSON.stringify(inBookingSession(overrides)));
}

async function readSession(redis: Redis): Promise<Record<string, unknown> | null> {
  const raw = await redis.hget(IN_BOOKING_KEY, SID);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

describe('in-booking 좌석 추가 Lua', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = createCommandRedis();
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it('세션이 없으면 SESSION_NOT_FOUND를 반환함', async () => {
    const result = await runAddBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [1, 2],
      enforceQuota: true,
    });

    expect(result.code).toBe('SESSION_NOT_FOUND');
  });

  it('예매 수량을 넘어서면 QUOTA_EXCEEDED를 반환하고 좌석을 추가하지 않음', async () => {
    await seedSession(redis, { bookingAmount: 1, bookedSeats: [[0, 0]] });

    const result = await runAddBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [1, 2],
      enforceQuota: true,
    });

    expect(result.code).toBe('QUOTA_EXCEEDED');
    expect(await readSession(redis)).toMatchObject({ bookedSeats: [[0, 0]] });
  });

  it('롤백처럼 수량 검사를 끄면 정원을 넘겨도 되돌려 넣음', async () => {
    await seedSession(redis, { bookingAmount: 1, bookedSeats: [[0, 0]] });

    const result = await runAddBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [1, 2],
      enforceQuota: false,
    });

    expect(result.code).toBe('OK');
    expect(await readSession(redis)).toMatchObject({
      bookedSeats: [
        [0, 0],
        [1, 2],
      ],
    });
  });

  it('빈 좌석 목록에 추가해도 다른 필드를 보존함', async () => {
    await seedSession(redis, { subscribedSection: 3 });

    await runAddBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [1, 2],
      enforceQuota: true,
    });

    expect(await readSession(redis)).toEqual({
      sid: SID,
      bookingAmount: 2,
      bookedSeats: [[1, 2]],
      saved: false,
      subscribedSection: 3,
    });
  });
});

describe('in-booking 좌석 제거 Lua', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = createCommandRedis();
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it('좌석이 없는데 취소를 요구하면 CANCEL_EMPTY를 반환함', async () => {
    await seedSession(redis);

    const result = await runRemoveBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [1, 2],
      requireBooked: true,
    });

    expect(result.code).toBe('CANCEL_EMPTY');
  });

  it('점유하지 않은 좌석을 취소하면 SEAT_NOT_BOOKED를 반환함', async () => {
    await seedSession(redis, { bookedSeats: [[0, 0]] });

    const result = await runRemoveBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [1, 2],
      requireBooked: true,
    });

    expect(result.code).toBe('SEAT_NOT_BOOKED');
    expect(await readSession(redis)).toMatchObject({ bookedSeats: [[0, 0]] });
  });

  it('취소하면 해당 좌석만 빼고 나머지를 보존함', async () => {
    await seedSession(redis, {
      bookedSeats: [
        [0, 0],
        [1, 2],
      ],
    });

    const result = await runRemoveBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [0, 0],
      requireBooked: true,
    });

    expect(result.code).toBe('OK');
    expect(await readSession(redis)).toMatchObject({ bookedSeats: [[1, 2]] });
  });

  it('롤백 모드는 없는 좌석을 지워도 실패로 보지 않음', async () => {
    await seedSession(redis);

    const result = await runRemoveBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [1, 2],
      requireBooked: false,
    });

    expect(result.code).toBe('OK');
  });

  it('마지막 좌석을 빼도 좌석 목록이 배열로 유지됨', async () => {
    await seedSession(redis, { bookedSeats: [[1, 2]] });

    await runRemoveBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [1, 2],
      requireBooked: true,
    });

    const session = await readSession(redis);
    expect(Array.isArray(session?.bookedSeats)).toBe(true);
    expect(session?.bookedSeats).toEqual([]);
  });
});

describe('in-booking 좌석 회수 Lua', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = createCommandRedis();
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it('좌석 목록을 한 번에 꺼내면서 비움', async () => {
    await seedSession(redis, {
      bookedSeats: [
        [0, 0],
        [1, 2],
      ],
    });

    const result = await runFlushBookedSeatsLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
    });

    expect(result.code).toBe('OK');
    expect(result.seats).toEqual([
      [0, 0],
      [1, 2],
    ]);
    expect(await readSession(redis)).toMatchObject({ bookedSeats: [] });
  });

  it('예매 수량을 함께 지정하면 좌석을 비우고 수량을 바꿈', async () => {
    await seedSession(redis, { bookedSeats: [[0, 0]] });

    const result = await runFlushBookedSeatsLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      bookingAmount: 5,
    });

    expect(result.seats).toEqual([[0, 0]]);
    expect(await readSession(redis)).toMatchObject({ bookedSeats: [], bookingAmount: 5 });
  });

  it('이미 예매가 확정된 세션은 좌석을 회수하지 않음', async () => {
    await seedSession(redis, { bookedSeats: [[0, 0]], saved: true });

    const result = await runFlushBookedSeatsLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      onlyWhenUnsaved: true,
    });

    expect(result.code).toBe('OK');
    expect(result.seats).toEqual([]);
    expect(await readSession(redis)).toMatchObject({ bookedSeats: [[0, 0]] });
  });

  it('세션이 없으면 좌석 목록을 빈 배열로 돌려줌', async () => {
    const result = await runFlushBookedSeatsLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
    });

    expect(result.code).toBe('SESSION_NOT_FOUND');
    expect(result.seats).toEqual([]);
  });
});

describe('in-booking 스칼라 필드 Lua', () => {
  let redis: Redis;

  beforeEach(() => {
    redis = createCommandRedis();
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it('예매 확정 표시는 좌석 목록을 건드리지 않음', async () => {
    await seedSession(redis, { bookedSeats: [[0, 0]] });

    const result = await runSetInBookingSavedLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      saved: true,
    });

    expect(result.code).toBe('OK');
    expect(await readSession(redis)).toMatchObject({ saved: true, bookedSeats: [[0, 0]] });
  });

  it('구독 섹션 갱신은 좌석 목록을 건드리지 않음', async () => {
    await seedSession(redis, { bookedSeats: [[0, 0]] });

    const result = await runSetSubscribedSectionLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      sectionIndex: 3,
    });

    expect(result.code).toBe('OK');
    expect(await readSession(redis)).toMatchObject({ subscribedSection: 3, bookedSeats: [[0, 0]] });
  });

  it('구독 섹션을 비우면 null로 저장함', async () => {
    await seedSession(redis, { subscribedSection: 3 });

    await runSetSubscribedSectionLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      sectionIndex: null,
    });

    expect(await readSession(redis)).toMatchObject({ subscribedSection: null });
  });
});

describe('in-booking 세션 Lua 정적 계약', () => {
  it('빈 좌석 목록이 객체로 인코딩되지 않도록 되돌림', () => {
    expect(inBookingSessionLuaHelpers).toContain(
      `string.gsub(encoded, '"bookedSeats":{}', '"bookedSeats":[]')`,
    );
  });

  it('세션 인코딩은 helper 한 곳에서만 수행함', () => {
    for (const script of [
      addBookedSeatLua,
      removeBookedSeatLua,
      flushBookedSeatsLua,
      setInBookingSavedLua,
      setSubscribedSectionLua,
    ]) {
      expect(script).toContain('writeInBookingSession(inBookingSessionsKey, sid, session)');
      // helper 정의 1회 외에 스크립트 본문에서 직접 encode하지 않음
      expect(script.split('cjson.encode(session)')).toHaveLength(2);
    }
  });

  it('회수한 좌석 목록은 항상 배열 형태로 직렬화함', () => {
    expect(inBookingSessionLuaHelpers).toContain("return '[' .. table.concat(parts, ',') .. ']'");
    expect(flushBookedSeatsLua).toContain('encodeSeatList(session.bookedSeats)');
  });

  it('스크립트 본문 직접 eval 대신 script cache 명령으로 등록함', () => {
    expect(addBookedSeatLua).not.toMatch(/redis\.eval\(/);
  });
});
