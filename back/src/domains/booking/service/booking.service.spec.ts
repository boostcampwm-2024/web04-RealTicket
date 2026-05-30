import { USER_STATUS } from '../../../auth/const/userStatus.const';
import { AppException } from '../../../common/exception/app.exception';
import { BookingErrorCode } from '../exception/booking-error-code';

import { BookingService } from './booking.service';

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
    enterBookingGate: jest.fn(),
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
    popQueue: jest.fn(),
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

  it('does not promote waiting queue head when transaction targetEvent changed', async () => {
    const { authService, redis, service, waitingQueueService } = createService();
    const transactionRedis = createRedisMock();
    const multi = createMultiMock();

    waitingQueueService.getQueueSize.mockResolvedValue(1);
    redis.lindex.mockResolvedValue(JSON.stringify({ sid: 'sid-1', order: 1 }));
    authService.enterBookingGate.mockImplementation(
      async (_sid: string, _eventId: number, options: TransitionOptionsFixture) => {
        const isValid = await options.validate?.(transactionRedis, createContext(2));
        if (isValid === false) {
          return null;
        }

        await options.mutate?.(multi, createContext(2));
        return successfulTransition('enterBookingGate');
      },
    );

    await (service as unknown as { letInNextWaiting(eventId: number): Promise<void> }).letInNextWaiting(1);

    expect(transactionRedis.lindex).not.toHaveBeenCalled();
    expect(multi.lpop).not.toHaveBeenCalled();
    expect(multi.zadd).not.toHaveBeenCalled();
  });
});
