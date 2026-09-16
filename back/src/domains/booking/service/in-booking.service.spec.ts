import { InBookingService } from './in-booking.service';

type TestableInBookingService = {
  removeExpiredReconnectingSessions(eventId: number): Promise<void>;
};

function createService(
  expiredSessions: string[] = ['expired-sid'],
  execResult: [[Error | null, string[]], [Error | null, number]] = [
    [null, expiredSessions],
    [null, expiredSessions.length],
  ],
) {
  const multi = {
    zrangebyscore: jest.fn().mockReturnThis(),
    zremrangebyscore: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(execResult),
  };
  const redis = {
    multi: jest.fn(() => multi),
  };
  const eventEmitter = {
    emit: jest.fn(),
  };
  const schedulerRegistry = {
    doesExist: jest.fn().mockReturnValue(false),
    deleteInterval: jest.fn(),
    addInterval: jest.fn(),
  };
  const logger = {
    error: jest.fn(),
  };

  const service = new InBookingService(
    {} as never,
    { getOrThrow: jest.fn(() => redis) } as never,
    eventEmitter as never,
    schedulerRegistry as never,
    logger as never,
  ) as unknown as TestableInBookingService;

  return { service, eventEmitter };
}

describe('InBookingService 만료된 재연결 세션 정리', () => {
  it('만료된 재연결 풀 항목 삭제가 성공하면 종료 이벤트를 발행함', async () => {
    const { service, eventEmitter } = createService(['expired-sid']);

    await service.removeExpiredReconnectingSessions(42);

    expect(eventEmitter.emit).toHaveBeenCalledWith('seats-sse-close', { sid: 'expired-sid' });
  });

  it('만료된 재연결 풀 항목 삭제가 실패하면 종료 이벤트를 발행하지 않음', async () => {
    const removalError = new Error('zremrangebyscore failed');
    const { service, eventEmitter } = createService(
      ['expired-sid'],
      [
        [null, ['expired-sid']],
        [removalError, 0],
      ],
    );

    await expect(service.removeExpiredReconnectingSessions(42)).rejects.toThrow(removalError);

    expect(eventEmitter.emit).not.toHaveBeenCalled();
  });
});
