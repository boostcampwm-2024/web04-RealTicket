import { EnterBookingService } from './enter-booking.service';

type TestableEnterBookingService = {
  removeExpiredSessions(eventId: number): Promise<void>;
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
    unlink: jest.fn().mockResolvedValue(1),
  };
  const authService = {
    resetToLogin: jest.fn().mockResolvedValue({ ok: true }),
  };
  const schedulerRegistry = {
    doesExist: jest.fn().mockReturnValue(false),
    deleteInterval: jest.fn(),
    addInterval: jest.fn(),
  };

  const service = new EnterBookingService(
    { getOrThrow: jest.fn(() => redis) } as never,
    authService as never,
    schedulerRegistry as never,
  ) as unknown as TestableEnterBookingService;

  return { service, redis, multi, authService };
}

describe('EnterBookingService entering GC', () => {
  it('resets expired entering sessions to LOGIN/null and deletes temp booking amount keys', async () => {
    const { service, redis, authService } = createService(['expired-sid']);

    await service.removeExpiredSessions(42);

    expect(redis.unlink).toHaveBeenCalledWith('entering:expired-sid:temp-booking-amount');
    expect(authService.resetToLogin).toHaveBeenCalledWith('expired-sid', null);
  });

  it('does not delete temp booking amount for non-expired entering sessions', async () => {
    const { service, redis, authService } = createService(['expired-sid']);

    await service.removeExpiredSessions(42);

    expect(redis.unlink).not.toHaveBeenCalledWith('entering:fresh-sid:temp-booking-amount');
    expect(authService.resetToLogin).not.toHaveBeenCalledWith('fresh-sid', null);
  });

  it('does not reset sessions when expired entering removal fails', async () => {
    const removalError = new Error('zremrangebyscore failed');
    const { service, redis, authService } = createService(
      ['expired-sid'],
      [
        [null, ['expired-sid']],
        [removalError, 0],
      ],
    );

    await expect(service.removeExpiredSessions(42)).rejects.toThrow(removalError);

    expect(redis.unlink).not.toHaveBeenCalled();
    expect(authService.resetToLogin).not.toHaveBeenCalled();
  });
});
