import Redis from 'ioredis';

import { USER_STATUS } from '../../auth/fsm/user-state.fsm';
import { runUserStateTransitionLua } from '../../auth/luaScripts/userStateTransitionLua';
import {
  runImmediateAdmissionLua,
  runWaitingHeadPromotionLua,
} from '../../domains/booking/luaScripts/admissionCapacityLua';
import {
  runAddBookedSeatLua,
  runFlushBookedSeatsLua,
  runRemoveBookedSeatLua,
  runSetInBookingSavedLua,
  runSetSubscribedSectionLua,
} from '../../domains/booking/luaScripts/inBookingSessionLua';
import {
  runMarkReconnectingLua,
  runRestoreSelectingLua,
} from '../../domains/booking/luaScripts/reconnectingTransitionLua';
import { runStartSeatSelectionLua } from '../../domains/booking/luaScripts/startSeatSelectionLua';
import { runWaitingQueueEntryLua } from '../../domains/booking/luaScripts/waitingQueueEntryLua';

/**
 * 실제 Redis에서 Lua 스크립트 본문을 실행해 검증한다.
 * `ioredis-mock`에는 cjson이 없어 다른 테스트는 계약을 흉내 낸 command mock으로만 검증하므로,
 * 스크립트가 실제로 도는지는 이 파일에서만 확인된다.
 *
 * 실행: npm --prefix back run test:lua   (VM Redis가 켜져 있어야 함)
 */
const REDIS_HOST = process.env.LUA_TEST_REDIS_HOST ?? '192.168.138.2';
const REDIS_PORT = Number(process.env.LUA_TEST_REDIS_PORT ?? 6379);
const REDIS_DB = Number(process.env.LUA_TEST_REDIS_DB ?? 15);

const EVENT_ID = 42;
const SID = 'sid-1';
const SESSION_KEY = `user:${SID}`;
const ENTERING_KEY = `entering:${EVENT_ID}`;
const IN_BOOKING_KEY = `in-booking:${EVENT_ID}:sessions`;
const RECONNECTING_KEY = `reconnecting:${EVENT_ID}`;
const MAX_SIZE_KEY = `in-booking:${EVENT_ID}:max-size`;
const DEFAULT_MAX_SIZE_KEY = 'in-booking:default-max-size';
const QUEUE_KEY = `waiting-queue:${EVENT_ID}`;
const ORDER_KEY = `waiting-queue:${EVENT_ID}:order`;
const AMOUNT_KEY = `entering:${SID}:temp-booking-amount`;

const admissionKeys = {
  enteringKey: ENTERING_KEY,
  inBookingSessionsKey: IN_BOOKING_KEY,
  reconnectingKey: RECONNECTING_KEY,
  maxSizeKey: MAX_SIZE_KEY,
  defaultMaxSizeKey: DEFAULT_MAX_SIZE_KEY,
};

let redis: Redis;

function userSession(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: 1,
    loginId: 'guest-1',
    roles: ['USER'],
    targetEvent: null,
    userStatus: USER_STATUS.LOGIN,
    ...overrides,
  });
}

async function readJson(key: string): Promise<Record<string, unknown> | null> {
  const raw = await redis.get(key);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

async function readInBooking(): Promise<Record<string, unknown> | null> {
  const raw = await redis.hget(IN_BOOKING_KEY, SID);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

beforeAll(async () => {
  redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, db: REDIS_DB, lazyConnect: true });
  await redis.connect();
});

afterAll(async () => {
  await redis.flushdb();
  redis.disconnect();
});

beforeEach(async () => {
  await redis.flushdb();
});

describe('실제 Redis - 기반 세션 전이 Lua', () => {
  it('상태를 바꾸면서 남은 TTL을 보존함', async () => {
    await redis.set(SESSION_KEY, userSession(), 'PX', 60_000);

    const result = await runUserStateTransitionLua(redis, {
      sessionKey: SESSION_KEY,
      action: 'enterWaiting',
      expectedFrom: USER_STATUS.LOGIN,
      nextTo: USER_STATUS.WAITING,
      targetEventPatch: { mode: 'set', eventId: EVENT_ID },
      expectedTargetEvent: null,
    });

    expect(result).toMatchObject({ ok: true, code: 'OK' });
    expect(await readJson(SESSION_KEY)).toMatchObject({
      userStatus: USER_STATUS.WAITING,
      targetEvent: EVENT_ID,
    });

    const ttl = await redis.pttl(SESSION_KEY);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it('현재 상태가 다르면 쓰지 않고 STATE_MISMATCH를 반환함', async () => {
    const stored = userSession({ userStatus: USER_STATUS.ENTERING });
    await redis.set(SESSION_KEY, stored);

    const result = await runUserStateTransitionLua(redis, {
      sessionKey: SESSION_KEY,
      action: 'enterWaiting',
      expectedFrom: USER_STATUS.LOGIN,
      nextTo: USER_STATUS.WAITING,
      targetEventPatch: { mode: 'set', eventId: EVENT_ID },
      expectedTargetEvent: null,
    });

    expect(result).toMatchObject({ ok: false, code: 'STATE_MISMATCH' });
    expect(await redis.get(SESSION_KEY)).toBe(stored);
  });

  it('targetEvent clear는 null로 저장되고 roles 배열이 유지됨', async () => {
    await redis.set(SESSION_KEY, userSession({ userStatus: USER_STATUS.WAITING, targetEvent: 7 }));

    await runUserStateTransitionLua(redis, {
      sessionKey: SESSION_KEY,
      action: 'resetToLogin',
      expectedFrom: USER_STATUS.WAITING,
      nextTo: USER_STATUS.LOGIN,
      targetEventPatch: { mode: 'clear' },
      expectedTargetEvent: 7,
    });

    const session = await readJson(SESSION_KEY);
    expect(session).toMatchObject({ userStatus: USER_STATUS.LOGIN, targetEvent: null });
    expect(Array.isArray(session?.roles)).toBe(true);
  });
});

describe('실제 Redis - 입장 capacity Lua', () => {
  it('즉시 입장은 entering 등록과 상태 전이를 함께 반영함', async () => {
    await redis.set(SESSION_KEY, userSession());

    const result = await runImmediateAdmissionLua(redis, {
      sessionKey: SESSION_KEY,
      eventId: EVENT_ID,
      keys: admissionKeys,
      defaultMaxSize: 10,
      nowMs: 1_700_000_000_000,
    });

    expect(result).toMatchObject({ ok: true, code: 'OK' });
    expect(await redis.zscore(ENTERING_KEY, SID)).toBe('1700000000000');
    expect(await readJson(SESSION_KEY)).toMatchObject({
      userStatus: USER_STATUS.ENTERING,
      targetEvent: EVENT_ID,
    });
  });

  it('정원이 차면 CAPACITY_FULL을 반환하고 아무것도 쓰지 않음', async () => {
    await redis.set(SESSION_KEY, userSession());
    await redis.set(MAX_SIZE_KEY, '1');
    await redis.zadd(ENTERING_KEY, 1, 'other');

    const result = await runImmediateAdmissionLua(redis, {
      sessionKey: SESSION_KEY,
      eventId: EVENT_ID,
      keys: admissionKeys,
      defaultMaxSize: 10,
      nowMs: 1,
    });

    expect(result).toMatchObject({ ok: false, code: 'CAPACITY_FULL' });
    expect(await redis.zscore(ENTERING_KEY, SID)).toBeNull();
  });

  it('대기열 head 승격은 head를 pop하고 상태를 ENTERING으로 바꿈', async () => {
    await redis.set(SESSION_KEY, userSession({ userStatus: USER_STATUS.WAITING, targetEvent: EVENT_ID }));
    await redis.rpush(QUEUE_KEY, JSON.stringify({ sid: SID, order: 1 }));

    const result = await runWaitingHeadPromotionLua(redis, {
      waitingQueueKey: QUEUE_KEY,
      userKeyPrefix: 'user:',
      eventId: EVENT_ID,
      keys: admissionKeys,
      defaultMaxSize: 10,
      nowMs: 1,
    });

    expect(result).toMatchObject({ ok: true, code: 'OK' });
    expect(await redis.llen(QUEUE_KEY)).toBe(0);
    expect(await readJson(SESSION_KEY)).toMatchObject({ userStatus: USER_STATUS.ENTERING });
  });

  it('세션 없는 stale head는 pop만 하고 다음으로 넘어감', async () => {
    await redis.rpush(QUEUE_KEY, JSON.stringify({ sid: 'ghost', order: 1 }));

    const result = await runWaitingHeadPromotionLua(redis, {
      waitingQueueKey: QUEUE_KEY,
      userKeyPrefix: 'user:',
      eventId: EVENT_ID,
      keys: admissionKeys,
      defaultMaxSize: 10,
      nowMs: 1,
    });

    expect(result).toMatchObject({ ok: false, code: 'STALE_SESSION_MISSING' });
    expect(await redis.llen(QUEUE_KEY)).toBe(0);
  });
});

describe('실제 Redis - 대기열 진입 Lua', () => {
  it('순번을 INCR로 발급하고 큐와 세션에 함께 반영함', async () => {
    await redis.set(SESSION_KEY, userSession());

    const { transition, order } = await runWaitingQueueEntryLua(redis, {
      sessionKey: SESSION_KEY,
      waitingQueueKey: QUEUE_KEY,
      waitingOrderKey: ORDER_KEY,
      eventId: EVENT_ID,
      sid: SID,
    });

    expect(transition).toMatchObject({ ok: true, code: 'OK' });
    expect(order).toBe(1);
    expect(JSON.parse((await redis.lindex(QUEUE_KEY, 0)) ?? '{}')).toEqual({ sid: SID, order: 1 });
    expect(await readJson(SESSION_KEY)).toMatchObject({
      userStatus: USER_STATUS.WAITING,
      targetEvent: EVENT_ID,
      waitingOrder: 1,
    });
  });

  it('여러 사용자가 진입해도 순번이 겹치지 않음', async () => {
    const orders: Array<number | null> = [];

    for (const sid of ['a', 'b', 'c']) {
      await redis.set(`user:${sid}`, userSession());
      const { order } = await runWaitingQueueEntryLua(redis, {
        sessionKey: `user:${sid}`,
        waitingQueueKey: QUEUE_KEY,
        waitingOrderKey: ORDER_KEY,
        eventId: EVENT_ID,
        sid,
      });
      orders.push(order);
    }

    expect(orders).toEqual([1, 2, 3]);
  });
});

describe('실제 Redis - 좌석 선택 진입 Lua', () => {
  it('생성된 in-booking 세션의 bookedSeats가 객체가 아니라 배열임', async () => {
    await redis.set(SESSION_KEY, userSession({ userStatus: USER_STATUS.ENTERING, targetEvent: EVENT_ID }));
    await redis.zadd(ENTERING_KEY, 1, SID);
    await redis.set(AMOUNT_KEY, '3');

    const result = await runStartSeatSelectionLua(redis, {
      sessionKey: SESSION_KEY,
      enteringKey: ENTERING_KEY,
      inBookingSessionsKey: IN_BOOKING_KEY,
      bookingAmountKey: AMOUNT_KEY,
      eventId: EVENT_ID,
      sid: SID,
    });

    expect(result).toMatchObject({ ok: true, code: 'OK' });
    expect(await readInBooking()).toEqual({
      sid: SID,
      bookingAmount: 3,
      bookedSeats: [],
      saved: false,
      subscribedSection: null,
    });
    expect(Array.isArray((await readInBooking())?.bookedSeats)).toBe(true);
    expect(await redis.zscore(ENTERING_KEY, SID)).toBeNull();
    expect(await redis.get(AMOUNT_KEY)).toBeNull();
  });

  it('entering 멤버가 아니면 아무것도 쓰지 않음', async () => {
    await redis.set(SESSION_KEY, userSession({ userStatus: USER_STATUS.ENTERING, targetEvent: EVENT_ID }));
    await redis.set(AMOUNT_KEY, '3');

    const result = await runStartSeatSelectionLua(redis, {
      sessionKey: SESSION_KEY,
      enteringKey: ENTERING_KEY,
      inBookingSessionsKey: IN_BOOKING_KEY,
      bookingAmountKey: AMOUNT_KEY,
      eventId: EVENT_ID,
      sid: SID,
    });

    expect(result).toMatchObject({ ok: false, code: 'NOT_ENTERING' });
    expect(await readInBooking()).toBeNull();
    expect(await redis.get(AMOUNT_KEY)).toBe('3');
    expect(await readJson(SESSION_KEY)).toMatchObject({ userStatus: USER_STATUS.ENTERING });
  });
});

describe('실제 Redis - 재연결 전이 Lua', () => {
  it('표시는 재연결 풀 등록과 상태 전이를 함께 반영함', async () => {
    await redis.set(
      SESSION_KEY,
      userSession({ userStatus: USER_STATUS.SELECTING_SEAT, targetEvent: EVENT_ID }),
    );

    const result = await runMarkReconnectingLua(redis, {
      sessionKey: SESSION_KEY,
      reconnectingKey: RECONNECTING_KEY,
      eventId: EVENT_ID,
      sid: SID,
      nowMs: 1_700_000_000_000,
    });

    expect(result).toMatchObject({ ok: true, code: 'OK' });
    expect(await redis.zscore(RECONNECTING_KEY, SID)).toBe('1700000000000');
    expect(await readJson(SESSION_KEY)).toMatchObject({
      userStatus: USER_STATUS.RECONNECTING_SELECTING,
    });
  });

  it('재연결 풀에 없으면 상태를 전이하지 않음', async () => {
    const stored = userSession({
      userStatus: USER_STATUS.RECONNECTING_SELECTING,
      targetEvent: EVENT_ID,
    });
    await redis.set(SESSION_KEY, stored);

    const result = await runRestoreSelectingLua(redis, {
      sessionKey: SESSION_KEY,
      reconnectingKey: RECONNECTING_KEY,
      eventId: EVENT_ID,
      sid: SID,
    });

    expect(result).toMatchObject({ ok: false, code: 'NOT_RECONNECTING' });
    expect(await redis.get(SESSION_KEY)).toBe(stored);
  });

  it('재연결 풀 멤버면 제거하고 좌석 선택으로 되돌림', async () => {
    await redis.set(
      SESSION_KEY,
      userSession({ userStatus: USER_STATUS.RECONNECTING_SELECTING, targetEvent: EVENT_ID }),
    );
    await redis.zadd(RECONNECTING_KEY, 1, SID);

    const result = await runRestoreSelectingLua(redis, {
      sessionKey: SESSION_KEY,
      reconnectingKey: RECONNECTING_KEY,
      eventId: EVENT_ID,
      sid: SID,
    });

    expect(result).toMatchObject({ ok: true, code: 'OK' });
    expect(await redis.zscore(RECONNECTING_KEY, SID)).toBeNull();
    expect(await readJson(SESSION_KEY)).toMatchObject({ userStatus: USER_STATUS.SELECTING_SEAT });
  });
});

describe('실제 Redis - in-booking 세션 필드 Lua', () => {
  async function seedInBooking(overrides: Record<string, unknown> = {}) {
    await redis.hset(
      IN_BOOKING_KEY,
      SID,
      JSON.stringify({
        sid: SID,
        bookingAmount: 2,
        bookedSeats: [],
        saved: false,
        subscribedSection: null,
        ...overrides,
      }),
    );
  }

  it('좌석을 추가하면 중첩 배열 형태가 유지됨', async () => {
    await seedInBooking();

    const result = await runAddBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [1, 2],
      enforceQuota: true,
    });

    expect(result.code).toBe('OK');
    expect(await readInBooking()).toEqual({
      sid: SID,
      bookingAmount: 2,
      bookedSeats: [[1, 2]],
      saved: false,
      subscribedSection: null,
    });
  });

  it('마지막 좌석을 빼도 빈 배열로 남고 객체가 되지 않음', async () => {
    await seedInBooking({ bookedSeats: [[1, 2]] });

    await runRemoveBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [1, 2],
      requireBooked: true,
    });

    const session = await readInBooking();
    expect(Array.isArray(session?.bookedSeats)).toBe(true);
    expect(session?.bookedSeats).toEqual([]);
  });

  it('예매 수량을 넘으면 QUOTA_EXCEEDED로 막음', async () => {
    await seedInBooking({
      bookingAmount: 1,
      bookedSeats: [[0, 0]],
    });

    const result = await runAddBookedSeatLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      seat: [1, 2],
      enforceQuota: true,
    });

    expect(result.code).toBe('QUOTA_EXCEEDED');
    expect(await readInBooking()).toMatchObject({ bookedSeats: [[0, 0]] });
  });

  it('좌석 회수는 목록을 돌려주면서 배열로 비움', async () => {
    await seedInBooking({
      bookedSeats: [
        [0, 1],
        [2, 3],
      ],
    });

    const result = await runFlushBookedSeatsLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      onlyWhenUnsaved: true,
    });

    expect(result.code).toBe('OK');
    expect(result.seats).toEqual([
      [0, 1],
      [2, 3],
    ]);

    const session = await readInBooking();
    expect(Array.isArray(session?.bookedSeats)).toBe(true);
    expect(session?.bookedSeats).toEqual([]);
  });

  it('이미 확정된 세션은 좌석을 회수하지 않음', async () => {
    await seedInBooking({ bookedSeats: [[0, 1]], saved: true });

    const result = await runFlushBookedSeatsLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      onlyWhenUnsaved: true,
    });

    expect(result.seats).toEqual([]);
    expect(await readInBooking()).toMatchObject({ bookedSeats: [[0, 1]] });
  });

  it('확정 표시와 섹션 갱신이 좌석 목록을 건드리지 않음', async () => {
    await seedInBooking({ bookedSeats: [[0, 1]] });

    await runSetInBookingSavedLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      saved: true,
    });
    await runSetSubscribedSectionLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      sectionIndex: 3,
    });

    expect(await readInBooking()).toEqual({
      sid: SID,
      bookingAmount: 2,
      bookedSeats: [[0, 1]],
      saved: true,
      subscribedSection: 3,
    });
  });

  it('섹션을 비우면 null로 저장됨', async () => {
    await seedInBooking({ subscribedSection: 3 });

    await runSetSubscribedSectionLua(redis, {
      inBookingSessionsKey: IN_BOOKING_KEY,
      sid: SID,
      sectionIndex: null,
    });

    expect(await readInBooking()).toMatchObject({ subscribedSection: null });
  });
});
