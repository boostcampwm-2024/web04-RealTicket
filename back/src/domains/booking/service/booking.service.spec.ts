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
import {
  runMarkReconnectingLua,
  runRestoreSelectingLua,
  type MarkReconnectingLuaResult,
  type RestoreSelectingLuaResult,
} from '../luaScripts/reconnectingTransitionLua';
import {
  runStartSeatSelectionLua,
  type StartSeatSelectionLuaResult,
} from '../luaScripts/startSeatSelectionLua';
import { runWaitingQueueEntryLua, type WaitingQueueEntryLuaResult } from '../luaScripts/waitingQueueEntryLua';

import { BookingService } from './booking.service';

jest.mock('../luaScripts/admissionCapacityLua', () => ({
  runImmediateAdmissionLua: jest.fn(),
  runWaitingHeadPromotionLua: jest.fn(),
}));

jest.mock('../luaScripts/reconnectingTransitionLua', () => ({
  runMarkReconnectingLua: jest.fn(),
  runRestoreSelectingLua: jest.fn(),
}));

jest.mock('../luaScripts/waitingQueueEntryLua', () => ({
  runWaitingQueueEntryLua: jest.fn(),
}));

jest.mock('../luaScripts/startSeatSelectionLua', () => ({
  runStartSeatSelectionLua: jest.fn(),
}));

type RedisMock = Record<string, jest.Mock>;

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
    getUserSession: jest.fn(),
    getUserEventTarget: jest.fn(),
  };
  const bookingSeatsService = {
    updateSeatDeleted: jest.fn().mockResolvedValue(undefined),
  };
  const inBookingService = {
    emitSession: jest.fn(),
    flushAndSetBookingAmount: jest.fn(),
    flushUnsavedBookedSeats: jest.fn().mockResolvedValue([]),
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
    warn: jest.fn(),
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
    bookingSeatsService,
    inBookingService,
    logger,
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

function extractMethodBody(source: string, startMarker: string, endMarker: string): string {
  const methodStart = source.indexOf(startMarker);
  const nextMethodStart = source.indexOf(endMarker, methodStart);

  if (methodStart < 0 || nextMethodStart < 0) {
    throw new Error(`${startMarker} 본문을 찾을 수 없음`);
  }

  return source.slice(methodStart, nextMethodStart);
}

function markOkResult(): MarkReconnectingLuaResult {
  return {
    ok: true,
    code: 'OK',
    action: 'markReconnectingSelection',
    from: USER_STATUS.SELECTING_SEAT,
    to: USER_STATUS.RECONNECTING_SELECTING,
  };
}

function markFailedResult(code: 'STATE_MISMATCH' | 'SESSION_MISSING'): MarkReconnectingLuaResult {
  return {
    ok: false,
    code,
    action: 'markReconnectingSelection',
    expectedFrom: USER_STATUS.SELECTING_SEAT,
    nextTo: USER_STATUS.RECONNECTING_SELECTING,
    details: [],
  };
}

function restoreOkResult(): RestoreSelectingLuaResult {
  return {
    ok: true,
    code: 'OK',
    action: 'restoreSeatSelection',
    from: USER_STATUS.RECONNECTING_SELECTING,
    to: USER_STATUS.SELECTING_SEAT,
  };
}

function restoreFailedResult(code: 'NOT_RECONNECTING' | 'STATE_MISMATCH'): RestoreSelectingLuaResult {
  return {
    ok: false,
    code,
    action: 'restoreSeatSelection',
    expectedFrom: USER_STATUS.RECONNECTING_SELECTING,
    nextTo: USER_STATUS.SELECTING_SEAT,
    details: [],
  };
}

function waitingEntryOkResult(order: number): WaitingQueueEntryLuaResult {
  return {
    transition: {
      ok: true,
      code: 'OK',
      action: 'enterWaiting',
      from: USER_STATUS.LOGIN,
      to: USER_STATUS.WAITING,
    },
    order,
  };
}

function waitingEntryFailedResult(
  code: 'STATE_MISMATCH' | 'SESSION_MISSING' | 'TARGET_EVENT_MISMATCH',
): WaitingQueueEntryLuaResult {
  return {
    transition: {
      ok: false,
      code,
      action: 'enterWaiting',
      expectedFrom: USER_STATUS.LOGIN,
      nextTo: USER_STATUS.WAITING,
      details: [],
    },
    order: null,
  };
}

function startSeatSelectionOkResult(): StartSeatSelectionLuaResult {
  return {
    ok: true,
    code: 'OK',
    action: 'startSeatSelection',
    from: USER_STATUS.ENTERING,
    to: USER_STATUS.SELECTING_SEAT,
  };
}

function startSeatSelectionFailedResult(
  code: 'NOT_ENTERING' | 'STATE_MISMATCH' | 'TARGET_EVENT_MISMATCH',
): StartSeatSelectionLuaResult {
  return {
    ok: false,
    code,
    action: 'startSeatSelection',
    expectedFrom: USER_STATUS.ENTERING,
    nextTo: USER_STATUS.SELECTING_SEAT,
    details: [],
  };
}

async function callLetInNextWaiting(service: BookingService, eventId = 42) {
  await (service as unknown as { letInNextWaiting(eventId: number): Promise<void> }).letInNextWaiting(
    eventId,
  );
}

describe('BookingService 좌석 선택 진입 Lua 연동', () => {
  const runStartSeatSelectionLuaMock = jest.mocked(runStartSeatSelectionLua);

  beforeEach(() => {
    runStartSeatSelectionLuaMock.mockReset();
  });

  it('세션에 대상 이벤트가 없으면 Lua를 호출하지 않고 SESSION_EVENT_NOT_FOUND를 던짐', async () => {
    const { authService, service } = createService();
    authService.getUserEventTarget.mockResolvedValue(null);

    await expect(service.setInBookingFromEntering('sid-1')).rejects.toBeInstanceOf(AppException);
    expect(runStartSeatSelectionLuaMock).not.toHaveBeenCalled();
  });

  it('entering 풀, in-booking 해시, 임시 예매 수량 키를 Lua runner에 넘김', async () => {
    const { authService, redis, service } = createService();
    authService.getUserEventTarget.mockResolvedValue(42);
    runStartSeatSelectionLuaMock.mockResolvedValue(startSeatSelectionOkResult());

    await expect(service.setInBookingFromEntering('sid-1')).resolves.toBeUndefined();

    expect(runStartSeatSelectionLuaMock).toHaveBeenCalledWith(redis, {
      sessionKey: 'user:sid-1',
      enteringKey: 'entering:42',
      inBookingSessionsKey: 'in-booking:42:sessions',
      bookingAmountKey: 'entering:sid-1:temp-booking-amount',
      eventId: 42,
      sid: 'sid-1',
    });
  });

  it('entering 멤버가 아니면 INVALID_STATE로 변환함', async () => {
    const { authService, service } = createService();
    authService.getUserEventTarget.mockResolvedValue(42);
    runStartSeatSelectionLuaMock.mockResolvedValue(startSeatSelectionFailedResult('NOT_ENTERING'));

    await expectInvalidState(() => service.setInBookingFromEntering('sid-1'));
  });

  it('좌석 선택 진입 경로는 WATCH 콜백으로 회귀하지 않음', () => {
    const source = readFileSync(join(__dirname, 'booking.service.ts'), 'utf8');
    const body = extractMethodBody(
      source,
      'async setInBookingFromEntering',
      'async restoreInBookingFromReconnecting',
    );

    expect(body).toContain('runStartSeatSelectionLua(this.redis');
    expect(body).not.toContain('watchKeys');
    expect(body).not.toContain('this.authService.startSeatSelection');
    expect(body).not.toContain('multi.hset');
  });

  it('BookingService에는 WATCH 기반 전이 옵션이 남아 있지 않음', () => {
    const source = readFileSync(join(__dirname, 'booking.service.ts'), 'utf8');

    expect(source).not.toContain('watchKeys');
    expect(source).not.toContain('validate:');
    expect(source).not.toContain('mutate:');
    expect(source).not.toContain('isSessionTargetingEvent');
  });
});

describe('BookingService 재연결 전이 Lua 연동', () => {
  const runMarkReconnectingLuaMock = jest.mocked(runMarkReconnectingLua);
  const runRestoreSelectingLuaMock = jest.mocked(runRestoreSelectingLua);

  beforeEach(() => {
    runMarkReconnectingLuaMock.mockReset();
    runRestoreSelectingLuaMock.mockReset();
  });

  it('재연결 표시는 세션 키와 재연결 풀 키를 Lua runner에 넘김', async () => {
    const { redis, service } = createService();
    runMarkReconnectingLuaMock.mockResolvedValue(markOkResult());

    await expect(service.markReconnectingFromSeat(42, 'sid-1')).resolves.toBe(true);

    expect(runMarkReconnectingLuaMock).toHaveBeenCalledWith(redis, {
      sessionKey: 'user:sid-1',
      reconnectingKey: 'reconnecting:42',
      eventId: 42,
      sid: 'sid-1',
      nowMs: expect.any(Number),
    });
  });

  it('재연결 표시가 실패하면 슬롯 누수 가능성을 경고 로그로 남기고 false를 반환함', async () => {
    const { logger, service } = createService();
    runMarkReconnectingLuaMock.mockResolvedValue(markFailedResult('STATE_MISMATCH'));

    await expect(service.markReconnectingFromSeat(42, 'sid-1')).resolves.toBe(false);

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('STATE_MISMATCH'));
  });

  it('재연결 복원은 세션 키와 재연결 풀 키를 Lua runner에 넘김', async () => {
    const { redis, service } = createService();
    runRestoreSelectingLuaMock.mockResolvedValue(restoreOkResult());

    await expect(service.restoreInBookingFromReconnecting(42, 'sid-1')).resolves.toBeUndefined();

    expect(runRestoreSelectingLuaMock).toHaveBeenCalledWith(redis, {
      sessionKey: 'user:sid-1',
      reconnectingKey: 'reconnecting:42',
      eventId: 42,
      sid: 'sid-1',
    });
  });

  it('재연결 풀 멤버가 아니면 INVALID_STATE로 변환함', async () => {
    const { service } = createService();
    runRestoreSelectingLuaMock.mockResolvedValue(restoreFailedResult('NOT_RECONNECTING'));

    await expectInvalidState(() => service.restoreInBookingFromReconnecting(42, 'sid-1'));
  });

  it('재연결 경로는 WATCH 기반 AuthService 콜백으로 회귀하지 않음', () => {
    const source = readFileSync(join(__dirname, 'booking.service.ts'), 'utf8');
    const restoreBody = extractMethodBody(
      source,
      'async restoreInBookingFromReconnecting',
      'async markReconnectingFromSeat',
    );
    const markBody = extractMethodBody(source, 'async markReconnectingFromSeat', 'async isAdmission');

    expect(markBody).toContain('runMarkReconnectingLua(this.redis');
    expect(restoreBody).toContain('runRestoreSelectingLua(this.redis');
    for (const body of [markBody, restoreBody]) {
      expect(body).not.toContain('watchKeys');
      expect(body).not.toContain('this.authService.markReconnectingSelection');
      expect(body).not.toContain('this.authService.restoreSeatSelection');
    }
  });
});

describe('BookingService immediate admission Lua integration', () => {
  const runImmediateAdmissionLuaMock = jest.mocked(runImmediateAdmissionLua);
  const runWaitingQueueEntryLuaMock = jest.mocked(runWaitingQueueEntryLua);

  beforeEach(() => {
    runImmediateAdmissionLuaMock.mockReset();
    runWaitingQueueEntryLuaMock.mockReset();
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
    runWaitingQueueEntryLuaMock.mockResolvedValue(waitingEntryOkResult(1));

    await expect(service.isAdmission(42, 'sid-1')).resolves.toEqual({
      waitingStatus: true,
      enteringStatus: false,
      userOrder: 1,
    });

    expect(runWaitingQueueEntryLuaMock).toHaveBeenCalledWith(redis, {
      sessionKey: 'user:sid-1',
      waitingQueueKey: 'waiting-queue:42',
      waitingOrderKey: 'waiting-queue:42:order',
      eventId: 42,
      sid: 'sid-1',
    });
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

    expect(runWaitingQueueEntryLuaMock).not.toHaveBeenCalled();
  });

  it('대기열 진입 Lua가 거부하면 INVALID_STATE로 변환함', async () => {
    const { openBookingService, authService, service } = createService();
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
    runWaitingQueueEntryLuaMock.mockResolvedValue(waitingEntryFailedResult('STATE_MISMATCH'));

    await expectInvalidState(() => service.isAdmission(42, 'sid-1'));
  });

  it('대기열 진입 경로는 WATCH 기반 order 갱신으로 회귀하지 않음', () => {
    const source = readFileSync(join(__dirname, 'booking.service.ts'), 'utf8');
    const body = extractMethodBody(source, 'private async tryEnterWaitingQueue', 'private getEnteringKey');

    expect(body).toContain('runWaitingQueueEntryLua(this.redis');
    expect(body).not.toContain('watchKeys');
    expect(body).not.toContain('this.authService.enterWaiting');
    expect(body).not.toContain('parseInt');
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
    const { redis, service } = createService();
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

describe('BookingService 대기 순번 조회', () => {
  it('세션에 순번이 있으면 대기열을 스캔하지 않고 그대로 반환함', async () => {
    const { openBookingService, authService, redis, service } = createService();
    openBookingService.isEventOpened.mockResolvedValue(true);
    authService.getUserSession.mockResolvedValue({
      ...loginSession(),
      targetEvent: 42,
      userStatus: USER_STATUS.WAITING,
      waitingOrder: 7,
    });

    await expect(service.isAdmission(42, 'sid-1')).resolves.toEqual({
      waitingStatus: true,
      enteringStatus: false,
      userOrder: 7,
    });

    expect(redis.lrange).not.toHaveBeenCalled();
  });

  it('순번이 없는 이전 세션만 대기열 스캔으로 보정함', async () => {
    const { openBookingService, authService, redis, service } = createService();
    openBookingService.isEventOpened.mockResolvedValue(true);
    authService.getUserSession.mockResolvedValue({
      ...loginSession(),
      targetEvent: 42,
      userStatus: USER_STATUS.WAITING,
    });
    redis.lrange.mockResolvedValue([JSON.stringify({ sid: 'sid-1', order: 3 })]);

    await expect(service.isAdmission(42, 'sid-1')).resolves.toEqual({
      waitingStatus: true,
      enteringStatus: false,
      userOrder: 3,
    });

    expect(redis.lrange).toHaveBeenCalledWith('waiting-queue:42', 0, -1);
  });
});

describe('BookingService 미확정 좌석 회수', () => {
  const runWaitingHeadPromotionLuaMock = jest.mocked(runWaitingHeadPromotionLua);

  beforeEach(() => {
    runWaitingHeadPromotionLuaMock.mockReset();
    // SSE 종료 정리는 대기열 승격까지 이어지므로 빈 큐로 고정함
    runWaitingHeadPromotionLuaMock.mockResolvedValue(promotionFailedResult('QUEUE_EMPTY'));
  });

  it('한 번의 회수 연산이 돌려준 좌석만 반납하고 세션을 다시 쓰지 않음', async () => {
    const { authService, bookingSeatsService, inBookingService, openBookingService, service } =
      createService();
    authService.getUserEventTarget.mockResolvedValue(42);
    openBookingService.isEventOpened.mockResolvedValue(true);
    inBookingService.flushUnsavedBookedSeats.mockResolvedValue([
      [0, 1],
      [2, 3],
    ]);

    await service.onSeatsSseDisconnected({ sid: 'sid-1' });

    expect(inBookingService.flushUnsavedBookedSeats).toHaveBeenCalledWith(42, 'sid-1');
    expect(bookingSeatsService.updateSeatDeleted).toHaveBeenCalledTimes(2);
    expect(bookingSeatsService.updateSeatDeleted).toHaveBeenCalledWith(42, [0, 1]);
    expect(bookingSeatsService.updateSeatDeleted).toHaveBeenCalledWith(42, [2, 3]);
    expect(inBookingService.setSession).not.toHaveBeenCalled();
  });

  it('회수할 좌석이 없으면 반납을 시도하지 않음', async () => {
    const { authService, bookingSeatsService, inBookingService, openBookingService, service } =
      createService();
    authService.getUserEventTarget.mockResolvedValue(42);
    openBookingService.isEventOpened.mockResolvedValue(true);
    inBookingService.flushUnsavedBookedSeats.mockResolvedValue([]);

    await service.onSeatsSseDisconnected({ sid: 'sid-1' });

    expect(bookingSeatsService.updateSeatDeleted).not.toHaveBeenCalled();
  });

  it('좌석 반납이 실패해도 나머지 정리를 계속하고 경고를 남김', async () => {
    const { authService, bookingSeatsService, inBookingService, logger, openBookingService, service } =
      createService();
    authService.getUserEventTarget.mockResolvedValue(42);
    openBookingService.isEventOpened.mockResolvedValue(true);
    inBookingService.flushUnsavedBookedSeats.mockResolvedValue([[0, 1]]);
    bookingSeatsService.updateSeatDeleted.mockRejectedValue(new Error('이미 반납된 좌석'));

    await expect(service.onSeatsSseDisconnected({ sid: 'sid-1' })).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('좌석 반납 실패'));
    expect(inBookingService.emitSession).toHaveBeenCalledWith(42, 'sid-1');
  });

  it('좌석 회수 경로가 세션 전체 덮어쓰기로 회귀하지 않음', () => {
    const source = readFileSync(join(__dirname, 'booking.service.ts'), 'utf8');

    expect(source).toContain('flushUnsavedBookedSeats');
    expect(source).not.toContain('inBookingService.setSession');
    expect(source).not.toContain('bookedSeats.forEach');
  });
});
