import { readFileSync } from 'fs';
import { join } from 'path';

import { USER_STATUS } from '../../../auth/const/userStatus.const';
import { AppException } from '../../../common/exception/app.exception';
import { IN_BOOKING_DEFAULT_MAX_SIZE } from '../const/inBookingDefaultMaxSize.const';
import { BookingErrorCode } from '../exception/booking-error-code';
import {
  runImmediateAdmissionLua,
  runWaitingHeadPromotionLua,
  type WaitingHeadPromotionBusinessCode,
  type WaitingHeadPromotionLuaResult,
} from '../luaScripts/admissionCapacityLua';

import { BookingService } from './booking.service';

jest.mock('../luaScripts/admissionCapacityLua', () => ({
  runImmediateAdmissionLua: jest.fn(),
  runWaitingHeadPromotionLua: jest.fn(),
}));

type TransitionContextFixture = {
  session: { targetEvent: number | null };
  sessionKey: string;
  result: { ok: true; action: string; from: string; to: string };
};

type RedisMock = Record<string, jest.Mock>;
type MultiMock = Record<string, jest.Mock>;

type TransitionOptionsFixture = {
  validate?: (redis: RedisMock, context: TransitionContextFixture) => boolean | Promise<boolean>;
  mutate?: (multi: MultiMock, context: TransitionContextFixture) => void | Promise<void>;
};

function createMultiMock(): MultiMock {
  return {
    del: jest.fn().mockReturnThis(),
    hset: jest.fn().mockReturnThis(),
    lpop: jest.fn().mockReturnThis(),
    zadd: jest.fn().mockReturnThis(),
    zrem: jest.fn().mockReturnThis(),
  };
}

function createRedisMock(): RedisMock {
  return {
    get: jest.fn().mockResolvedValue(null),
    hlen: jest.fn().mockResolvedValue(0),
    lindex: jest.fn(),
    lrange: jest.fn().mockResolvedValue([]),
    zcard: jest.fn().mockResolvedValue(0),
    zscore: jest.fn().mockResolvedValue('1'),
  };
}

function createContext(targetEvent: number | null): TransitionContextFixture {
  return {
    session: { targetEvent },
    sessionKey: 'user:sid-1',
    result: {
      ok: true,
      action: 'transition',
      from: USER_STATUS.ENTERING,
      to: USER_STATUS.SELECTING_SEAT,
    },
  };
}

function successfulTransition(action: string) {
  return {
    ok: true,
    action,
    from: USER_STATUS.ENTERING,
    to: USER_STATUS.SELECTING_SEAT,
  };
}

function createService() {
  const redis = createRedisMock();
  const pubsubClient = {
    on: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };
  const redisService = {
    getOrThrow: jest.fn((name?: string) => (name === 'pubsub' ? pubsubClient : redis)),
  };

  const authService = {
    enterWaiting: jest.fn(),
    enterBookingGate: jest.fn(),
    getUserSession: jest.fn(),
    getUserEventTarget: jest.fn(),
    markReconnectingSelection: jest.fn(),
    restoreSeatSelection: jest.fn(),
    startSeatSelection: jest.fn(),
  };
  const bookingSeatsService = {
    updateSeatDeleted: jest.fn(),
  };
  const inBookingService = {
    emitSession: jest.fn(),
    flushAndSetBookingAmount: jest.fn(),
    getSession: jest.fn(),
    isInBooking: jest.fn(),
    setSession: jest.fn(),
  };
  const openBookingService = {
    getOpenedEventIds: jest.fn(),
    isEventOpened: jest.fn(),
  };
  const waitingQueueService = {
    getQueueSize: jest.fn(),
  };
  const enterBookingService = {
    isEntering: jest.fn(),
    setBookingAmount: jest.fn(),
  };
  const logger = {
    error: jest.fn(),
  };

  const service = new BookingService(
    authService as never,
    bookingSeatsService as never,
    inBookingService as never,
    openBookingService as never,
    waitingQueueService as never,
    enterBookingService as never,
    redisService as never,
    logger as never,
  );

  return {
    authService,
    openBookingService,
    redis,
    service,
    waitingQueueService,
  };
}

async function expectInvalidState(action: () => Promise<unknown>) {
  let thrown: unknown;

  try {
    await action();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(AppException);
  expect((thrown as AppException).getCode()).toBe(BookingErrorCode.INVALID_STATE);
}

function loginSession() {
  return {
    id: 1,
    loginId: 'guest-1',
    roles: ['USER'],
    targetEvent: null,
    userStatus: USER_STATUS.LOGIN,
  };
}

function extractTryEnterBookingGateBody(source: string): string {
  const methodStart = source.indexOf('private async tryEnterBookingGate');
  const nextMethodStart = source.indexOf('private async tryEnterWaitingQueue', methodStart);

  if (methodStart < 0 || nextMethodStart < 0) {
    throw new Error('tryEnterBookingGate 본문을 찾을 수 없음');
  }

  return source.slice(methodStart, nextMethodStart);
}

function extractLetInNextWaitingBody(source: string): string {
  const methodStart = source.indexOf('private async letInNextWaiting');
  const nextMethodStart = source.indexOf('async setInBookingFromEntering', methodStart);

  if (methodStart < 0 || nextMethodStart < 0) {
    throw new Error('letInNextWaiting 본문을 찾을 수 없음');
  }

  return source.slice(methodStart, nextMethodStart);
}

function promotionOkResult(): WaitingHeadPromotionLuaResult {
  return {
    ok: true,
    code: 'OK',
    action: 'enterBookingGate',
    from: USER_STATUS.WAITING,
    to: USER_STATUS.ENTERING,
  };
}

function promotionFailedResult(
  code: WaitingHeadPromotionBusinessCode,
  details: unknown[] = [],
): WaitingHeadPromotionLuaResult {
  return {
    ok: false,
    code,
    action: 'enterBookingGate',
    expectedFrom: USER_STATUS.WAITING,
    nextTo: USER_STATUS.ENTERING,
    details,
  };
}

async function callLetInNextWaiting(service: BookingService, eventId = 42) {
  await (service as unknown as { letInNextWaiting(eventId: number): Promise<void> }).letInNextWaiting(
    eventId,
  );
}

describe('BookingService transaction-local event ownership validation', () => {
  it('does not move entering state into in-booking when transaction targetEvent changed', async () => {
    const { authService, service } = createService();
    const transactionRedis = createRedisMock();
    const multi = createMultiMock();

    authService.getUserEventTarget.mockResolvedValue(1);
    authService.startSeatSelection.mockImplementation(
      async (_sid: string, options: TransitionOptionsFixture) => {
        const isValid = await options.validate?.(transactionRedis, createContext(2));
        if (isValid === false) {
          return null;
        }

        await options.mutate?.(multi, createContext(2));
        return successfulTransition('startSeatSelection');
      },
    );

    await expectInvalidState(() => service.setInBookingFromEntering('sid-1'));

    expect(transactionRedis.zscore).not.toHaveBeenCalled();
    expect(transactionRedis.get).not.toHaveBeenCalled();
    expect(multi.zrem).not.toHaveBeenCalled();
    expect(multi.del).not.toHaveBeenCalled();
    expect(multi.hset).not.toHaveBeenCalled();
  });

  it('does not restore reconnecting state for a mismatched transaction targetEvent', async () => {
    const { authService, service } = createService();
    const transactionRedis = createRedisMock();
    const multi = createMultiMock();

    authService.restoreSeatSelection.mockImplementation(
      async (_sid: string, options: TransitionOptionsFixture) => {
        const isValid = await options.validate?.(transactionRedis, createContext(2));
        if (isValid === false) {
          return null;
        }

        await options.mutate?.(multi, createContext(2));
        return successfulTransition('restoreSeatSelection');
      },
    );

    await expectInvalidState(() => service.restoreInBookingFromReconnecting(1, 'sid-1'));

    expect(transactionRedis.zscore).not.toHaveBeenCalled();
    expect(multi.zrem).not.toHaveBeenCalled();
  });

  it('returns false without reconnecting zadd when transaction targetEvent changed', async () => {
    const { authService, service } = createService();
    const transactionRedis = createRedisMock();
    const multi = createMultiMock();

    authService.markReconnectingSelection.mockImplementation(
      async (_sid: string, options: TransitionOptionsFixture) => {
        const isValid = await options.validate?.(transactionRedis, createContext(2));
        if (isValid === false) {
          return null;
        }

        await options.mutate?.(multi, createContext(2));
        return successfulTransition('markReconnectingSelection');
      },
    );

    await expect(service.markReconnectingFromSeat(1, 'sid-1')).resolves.toBe(false);

    expect(multi.zadd).not.toHaveBeenCalled();
  });
});

describe('BookingService immediate admission Lua integration', () => {
  const runImmediateAdmissionLuaMock = jest.mocked(runImmediateAdmissionLua);

  beforeEach(() => {
    runImmediateAdmissionLuaMock.mockReset();
  });

  it('즉시 입장 Lua OK 결과를 기존 entering DTO로 반환하고 WATCH 경로를 호출하지 않음', async () => {
    const { authService, openBookingService, redis, service } = createService();
    openBookingService.isEventOpened.mockResolvedValue(true);
    authService.getUserSession.mockResolvedValue(loginSession());
    runImmediateAdmissionLuaMock.mockResolvedValue({
      ok: true,
      code: 'OK',
      action: 'enterBookingGate',
      from: USER_STATUS.LOGIN,
      to: USER_STATUS.ENTERING,
    });

    await expect(service.isAdmission(42, 'sid-1')).resolves.toEqual({
      waitingStatus: false,
      enteringStatus: true,
    });

    expect(runImmediateAdmissionLuaMock).toHaveBeenCalledWith(redis, {
      sessionKey: 'user:sid-1',
      eventId: 42,
      keys: {
        enteringKey: 'entering:42',
        inBookingSessionsKey: 'in-booking:42:sessions',
        reconnectingKey: 'reconnecting:42',
        maxSizeKey: 'in-booking:42:max-size',
        defaultMaxSizeKey: 'in-booking:default-max-size',
      },
      defaultMaxSize: IN_BOOKING_DEFAULT_MAX_SIZE,
      nowMs: expect.any(Number),
    });
    expect(authService.enterBookingGate).not.toHaveBeenCalled();
  });

  it('즉시 입장 Lua CAPACITY_FULL 결과는 INVALID_STATE가 아니라 기존 대기열 DTO로 이어짐', async () => {
    const { authService, openBookingService, redis, service } = createService();
    openBookingService.isEventOpened.mockResolvedValue(true);
    authService.getUserSession.mockResolvedValue(loginSession());
    runImmediateAdmissionLuaMock.mockResolvedValue({
      ok: false,
      code: 'CAPACITY_FULL',
      action: 'enterBookingGate',
      expectedFrom: USER_STATUS.LOGIN,
      nextTo: USER_STATUS.ENTERING,
      details: [],
    });
    authService.enterWaiting.mockImplementation(
      async (_sid: string, _eventId: number, options: TransitionOptionsFixture) => {
        await options.validate?.(redis, createContext(null));
        return { ok: true, action: 'enterWaiting' };
      },
    );

    await expect(service.isAdmission(42, 'sid-1')).resolves.toEqual({
      waitingStatus: true,
      enteringStatus: false,
      userOrder: 1,
    });

    expect(authService.enterBookingGate).not.toHaveBeenCalled();
    expect(authService.enterWaiting).toHaveBeenCalledWith(
      'sid-1',
      42,
      expect.objectContaining({
        watchKeys: ['waiting-queue:42', 'waiting-queue:42:order'],
      }),
    );
  });

  it('즉시 입장 Lua stale 세션 결과는 기존 INVALID_STATE 예외로 유지함', async () => {
    const { authService, openBookingService, service } = createService();
    openBookingService.isEventOpened.mockResolvedValue(true);
    authService.getUserSession.mockResolvedValue(loginSession());
    runImmediateAdmissionLuaMock.mockResolvedValue({
      ok: false,
      code: 'SESSION_MISSING',
      action: 'enterBookingGate',
      expectedFrom: USER_STATUS.LOGIN,
      nextTo: USER_STATUS.ENTERING,
      details: [],
    });

    await expectInvalidState(() => service.isAdmission(42, 'sid-1'));

    expect(authService.enterBookingGate).not.toHaveBeenCalled();
    expect(authService.enterWaiting).not.toHaveBeenCalled();
  });
});

describe('BookingService immediate admission static regression gates', () => {
  it('즉시 입장 경로는 Lua runner를 사용하고 hot admission WATCH로 회귀하지 않음', () => {
    const source = readFileSync(join(__dirname, 'booking.service.ts'), 'utf8');
    const immediateAdmissionBody = extractTryEnterBookingGateBody(source);

    expect(immediateAdmissionBody).toContain('runImmediateAdmissionLua(this.redis');
    expect(immediateAdmissionBody).not.toContain('this.authService.enterBookingGate');
    expect(immediateAdmissionBody).not.toContain('getAdmissionWatchKeys');
    expect(immediateAdmissionBody).not.toContain('watchKeys');
    expect(immediateAdmissionBody).not.toContain('lost');
  });
});

describe('BookingService waiting-head promotion Lua integration', () => {
  const runWaitingHeadPromotionLuaMock = jest.mocked(runWaitingHeadPromotionLua);

  beforeEach(() => {
    runWaitingHeadPromotionLuaMock.mockReset();
  });

  it('대기열 head 승격 OK면 정원이 찰 때까지 Lua 호출을 반복함', async () => {
    const { authService, redis, service } = createService();
    runWaitingHeadPromotionLuaMock
      .mockResolvedValueOnce(promotionOkResult())
      .mockResolvedValueOnce(promotionOkResult())
      .mockResolvedValueOnce(promotionFailedResult('CAPACITY_FULL'));

    await callLetInNextWaiting(service);

    expect(runWaitingHeadPromotionLuaMock).toHaveBeenCalledTimes(3);
    expect(runWaitingHeadPromotionLuaMock).toHaveBeenCalledWith(redis, {
      waitingQueueKey: 'waiting-queue:42',
      userKeyPrefix: 'user:',
      eventId: 42,
      keys: {
        enteringKey: 'entering:42',
        inBookingSessionsKey: 'in-booking:42:sessions',
        reconnectingKey: 'reconnecting:42',
        maxSizeKey: 'in-booking:42:max-size',
        defaultMaxSizeKey: 'in-booking:default-max-size',
      },
      defaultMaxSize: IN_BOOKING_DEFAULT_MAX_SIZE,
      nowMs: expect.any(Number),
    });
    expect(authService.enterBookingGate).not.toHaveBeenCalled();
  });

  it('stale head 결과면 다음 후보를 위해 Lua 호출을 계속함', async () => {
    const { service } = createService();
    runWaitingHeadPromotionLuaMock
      .mockResolvedValueOnce(promotionFailedResult('STALE_SESSION_MISSING', ['sid-1']))
      .mockResolvedValueOnce(promotionFailedResult('STALE_STATE_MISMATCH', [USER_STATUS.LOGIN]))
      .mockResolvedValueOnce(promotionFailedResult('QUEUE_EMPTY'));

    await callLetInNextWaiting(service);

    expect(runWaitingHeadPromotionLuaMock).toHaveBeenCalledTimes(3);
  });

  it('CAPACITY_FULL이면 승격 loop를 멈춤', async () => {
    const { service } = createService();
    runWaitingHeadPromotionLuaMock.mockResolvedValue(promotionFailedResult('CAPACITY_FULL'));

    await callLetInNextWaiting(service);

    expect(runWaitingHeadPromotionLuaMock).toHaveBeenCalledTimes(1);
  });

  it('QUEUE_EMPTY이면 queue pre-read 없이 승격 loop를 멈춤', async () => {
    const { redis, service, waitingQueueService } = createService();
    runWaitingHeadPromotionLuaMock.mockResolvedValue(promotionFailedResult('QUEUE_EMPTY'));

    await callLetInNextWaiting(service);

    expect(runWaitingHeadPromotionLuaMock).toHaveBeenCalledTimes(1);
    expect(waitingQueueService.getQueueSize).not.toHaveBeenCalled();
    expect(redis.lindex).not.toHaveBeenCalled();
  });

  it('Lua 실패는 삼키지 않고 caller로 throw함', async () => {
    const { service } = createService();
    const failure = new Error('redis lua failure');
    runWaitingHeadPromotionLuaMock.mockRejectedValue(failure);

    await expect(
      (service as unknown as { letInNextWaiting(eventId: number): Promise<void> }).letInNextWaiting(42),
    ).rejects.toThrow(failure);
  });

  it('대기열 head 승격 경로는 Lua runner를 사용하고 hot WATCH pre-read로 회귀하지 않음', () => {
    const source = readFileSync(join(__dirname, 'booking.service.ts'), 'utf8');
    const promotionBody = extractLetInNextWaitingBody(source);

    expect(promotionBody).toContain('runWaitingHeadPromotionLua(this.redis');
    expect(promotionBody).not.toContain('this.authService.enterBookingGate');
    expect(promotionBody).not.toContain('getWaitingHead');
    expect(promotionBody).not.toContain('getAdmissionWatchKeys');
  });
});

describe('BookingService Phase 2 final static gates', () => {
  it('입장 대상 경로 전체에서 hot admission WATCH helper와 AuthService enterBookingGate를 제거함', () => {
    const source = readFileSync(join(__dirname, 'booking.service.ts'), 'utf8');

    expect(source).toContain('runImmediateAdmissionLua');
    expect(source).toContain('runWaitingHeadPromotionLua');
    expect(source).not.toMatch(
      /getAdmissionWatchKeys|watchKeys: this\.getAdmissionWatchKeys|watchKeys: \[\.\.\.this\.getAdmissionWatchKeys/,
    );
    expect(source).not.toContain('authService.enterBookingGate');
  });
});
