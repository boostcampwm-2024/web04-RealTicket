import { ExecutionContext } from '@nestjs/common';

import { SeatsGateway } from '../../benchmark/gateway/seats.gateway';
import { USER_ROLE } from '../../domains/user/const/userRole';
import { AUTH_EXPIRE_TIME } from '../const/authExpireTime.const';
import { USER_STATUS } from '../const/userStatus.const';
import { AuthErrorCode } from '../exception/auth-error-code';

import { SessionAuthGuard } from './session.guard';

type RedisMock = {
  get: jest.Mock;
  expireat: jest.Mock;
};

function createContext(sid = 'sid-1'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ cookies: { SID: sid } }),
    }),
  } as unknown as ExecutionContext;
}

function createGuard(requirements: string | readonly string[]) {
  const redis: RedisMock = {
    get: jest.fn(),
    expireat: jest.fn(),
  };
  const redisService = {
    getOrThrow: jest.fn(() => redis),
  };
  const Guard = SessionAuthGuard(requirements);

  return {
    guard: new Guard(redisService as never),
    redis,
  };
}

function createGateway() {
  const redis: RedisMock = {
    get: jest.fn(),
    expireat: jest.fn(),
  };
  const redisService = {
    getOrThrow: jest.fn(() => redis),
  };
  const gateway = new SeatsGateway(
    { error: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    redisService as never,
  );

  return { gateway, redis };
}

async function expectAuthCode(promise: Promise<unknown>, code: AuthErrorCode) {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toHaveProperty('getCode');
    expect((error as { getCode: () => string }).getCode()).toBe(code);
  }
}

describe('SessionAuthGuard requirement router', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-26T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('requires explicit requirements at guard factory creation', () => {
    expect(() => {
      // @ts-expect-error callers must provide an explicit USER_ROLE or USER_STATUS requirement.
      SessionAuthGuard();
    }).toThrow('SessionAuthGuard requires explicit session requirements');
    expect(() => SessionAuthGuard([])).toThrow('SessionAuthGuard requires explicit session requirements');
  });

  it('allows USER role requirements for authenticated booking-state sessions', async () => {
    const { guard, redis } = createGuard(USER_ROLE.USER);
    redis.get.mockResolvedValue(
      JSON.stringify({ userStatus: USER_STATUS.SELECTING_SEAT, roles: [USER_ROLE.USER] }),
    );

    await expect(guard.canActivate(createContext())).resolves.toBe(true);

    expect(redis.expireat).toHaveBeenCalledWith(
      'user:sid-1',
      Math.round(Date.now() / 1000) + AUTH_EXPIRE_TIME,
    );
  });

  it('denies exact LOGIN state requirements for WAITING sessions without refreshing session TTL', async () => {
    const { guard, redis } = createGuard(USER_STATUS.LOGIN);
    redis.get.mockResolvedValue(JSON.stringify({ userStatus: USER_STATUS.WAITING, roles: [USER_ROLE.USER] }));

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.UNAUTHORIZED);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('allows ADMIN role requirements only for explicit ADMIN role sessions', async () => {
    const allowed = createGuard(USER_ROLE.ADMIN);
    allowed.redis.get.mockResolvedValue(
      JSON.stringify({
        userStatus: USER_STATUS.LOGIN,
        roles: [USER_ROLE.USER, USER_ROLE.ADMIN],
      }),
    );

    await expect(allowed.guard.canActivate(createContext())).resolves.toBe(true);
    expect(allowed.redis.expireat).toHaveBeenCalledTimes(1);

    const denied = createGuard(USER_ROLE.ADMIN);
    denied.redis.get.mockResolvedValue(
      JSON.stringify({ userStatus: USER_STATUS.LOGIN, roles: [USER_ROLE.USER] }),
    );

    await expectAuthCode(denied.guard.canActivate(createContext()), AuthErrorCode.UNAUTHORIZED);
    expect(denied.redis.expireat).not.toHaveBeenCalled();
  });

  it('allows mixed requirements through exact state or explicit role membership', async () => {
    const requirements = [USER_STATUS.SELECTING_SEAT, USER_ROLE.ADMIN];
    const selectingSeat = createGuard(requirements);
    selectingSeat.redis.get.mockResolvedValue(
      JSON.stringify({ userStatus: USER_STATUS.SELECTING_SEAT, roles: [USER_ROLE.USER] }),
    );

    await expect(selectingSeat.guard.canActivate(createContext())).resolves.toBe(true);

    const adminRole = createGuard(requirements);
    adminRole.redis.get.mockResolvedValue(
      JSON.stringify({
        userStatus: USER_STATUS.LOGIN,
        roles: [USER_ROLE.USER, USER_ROLE.ADMIN],
      }),
    );

    await expect(adminRole.guard.canActivate(createContext())).resolves.toBe(true);

    const denied = createGuard(requirements);
    denied.redis.get.mockResolvedValue(
      JSON.stringify({ userStatus: USER_STATUS.WAITING, roles: [USER_ROLE.USER] }),
    );

    await expectAuthCode(denied.guard.canActivate(createContext()), AuthErrorCode.UNAUTHORIZED);
    expect(denied.redis.expireat).not.toHaveBeenCalled();
  });

  it('denies unknown current statuses without refreshing session TTL', async () => {
    const { guard, redis } = createGuard(USER_STATUS.LOGIN);
    redis.get.mockResolvedValue(JSON.stringify({ userStatus: 'BROKEN_STATE', roles: [USER_ROLE.USER] }));

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.UNAUTHORIZED);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('denies unknown requirements without refreshing session TTL', async () => {
    const { guard, redis } = createGuard('BROKEN_REQUIREMENT');
    redis.get.mockResolvedValue(JSON.stringify({ userStatus: USER_STATUS.LOGIN, roles: [USER_ROLE.USER] }));

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.UNAUTHORIZED);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('denies stale admin status for selecting-seat-only requirements without refreshing session TTL', async () => {
    const { guard, redis } = createGuard(USER_STATUS.SELECTING_SEAT);
    const staleAdminState = USER_ROLE.ADMIN;
    redis.get.mockResolvedValue(
      JSON.stringify({ userStatus: staleAdminState, roles: [USER_ROLE.USER, USER_ROLE.ADMIN] }),
    );

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.UNAUTHORIZED);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('fails closed for malformed session JSON', async () => {
    const { guard, redis } = createGuard(USER_STATUS.LOGIN);
    redis.get.mockResolvedValue('{not-json');

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.SESSION_EXPIRED);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('preserves missing-session forbidden behavior', async () => {
    const { guard, redis } = createGuard(USER_STATUS.LOGIN);
    redis.get.mockResolvedValue(null);

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.FORBIDDEN);

    expect(redis.expireat).not.toHaveBeenCalled();
  });
});

describe('SeatsGateway explicit state access policy', () => {
  it.each([USER_STATUS.ENTERING, USER_STATUS.SELECTING_SEAT])(
    'allows exact %s sessions for the matching event and refreshes TTL',
    async (userStatus) => {
      const { gateway, redis } = createGateway();
      redis.get.mockResolvedValue(JSON.stringify({ userStatus, roles: [USER_ROLE.USER], targetEvent: 1 }));

      await expect(gateway.authorize('sid-1', 1)).resolves.toBe(true);

      expect(redis.expireat).toHaveBeenCalledWith('user:sid-1', expect.any(Number));
    },
  );

  it('denies role-only admin sessions for benchmark seat authorization', async () => {
    const { gateway, redis } = createGateway();
    redis.get.mockResolvedValue(
      JSON.stringify({
        userStatus: USER_STATUS.LOGIN,
        roles: [USER_ROLE.USER, USER_ROLE.ADMIN],
        targetEvent: 1,
      }),
    );

    await expect(gateway.authorize('sid-1', 1)).resolves.toBe(false);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('denies stale admin status sessions for benchmark seat authorization', async () => {
    const { gateway, redis } = createGateway();
    const staleAdminState = USER_ROLE.ADMIN;
    redis.get.mockResolvedValue(JSON.stringify({ userStatus: staleAdminState, targetEvent: 1 }));

    await expect(gateway.authorize('sid-1', 1)).resolves.toBe(false);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('denies matching state when targetEvent differs', async () => {
    const { gateway, redis } = createGateway();
    redis.get.mockResolvedValue(JSON.stringify({ userStatus: USER_STATUS.SELECTING_SEAT, targetEvent: 2 }));

    await expect(gateway.authorize('sid-1', 1)).resolves.toBe(false);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('fails closed for malformed session JSON', async () => {
    const { gateway, redis } = createGateway();
    redis.get.mockResolvedValue('{not-json');

    await expect(gateway.authorize('sid-1', 1)).resolves.toBe(false);

    expect(redis.expireat).not.toHaveBeenCalled();
  });
});
