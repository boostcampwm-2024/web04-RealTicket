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

describe('SessionAuthGuard 세션 요구사항 판정', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-26T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('가드 생성 시 세션 요구사항을 명시해야 함', () => {
    expect(() => {
      // @ts-expect-error 역할 또는 상태 요구사항은 필수다.
      SessionAuthGuard();
    }).toThrow('SessionAuthGuard requires explicit session requirements');
    expect(() => SessionAuthGuard([])).toThrow('SessionAuthGuard requires explicit session requirements');
  });

  it('예매 상태의 인증 세션은 USER 역할로 접근할 수 있음', async () => {
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

  it('WAITING 세션은 LOGIN 접근을 거부하고 TTL을 갱신하지 않음', async () => {
    const { guard, redis } = createGuard(USER_STATUS.LOGIN);
    redis.get.mockResolvedValue(JSON.stringify({ userStatus: USER_STATUS.WAITING, roles: [USER_ROLE.USER] }));

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.UNAUTHORIZED);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('명시적인 ADMIN 역할을 가진 세션만 관리자 접근을 허용함', async () => {
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

  it('명시한 상태나 역할 중 하나를 만족하면 접근을 허용함', async () => {
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

  it('알 수 없는 상태는 접근을 거부하고 TTL을 갱신하지 않음', async () => {
    const { guard, redis } = createGuard(USER_STATUS.LOGIN);
    redis.get.mockResolvedValue(JSON.stringify({ userStatus: 'BROKEN_STATE', roles: [USER_ROLE.USER] }));

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.UNAUTHORIZED);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('알 수 없는 요구사항은 접근을 거부하고 TTL을 갱신하지 않음', async () => {
    const { guard, redis } = createGuard('BROKEN_REQUIREMENT');
    redis.get.mockResolvedValue(JSON.stringify({ userStatus: USER_STATUS.LOGIN, roles: [USER_ROLE.USER] }));

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.UNAUTHORIZED);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('폐기된 ADMIN 상태는 좌석 선택 접근을 거부하고 TTL을 갱신하지 않음', async () => {
    const { guard, redis } = createGuard(USER_STATUS.SELECTING_SEAT);
    const staleAdminState = USER_ROLE.ADMIN;
    redis.get.mockResolvedValue(
      JSON.stringify({ userStatus: staleAdminState, roles: [USER_ROLE.USER, USER_ROLE.ADMIN] }),
    );

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.UNAUTHORIZED);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('손상된 세션 JSON은 접근을 거부함', async () => {
    const { guard, redis } = createGuard(USER_STATUS.LOGIN);
    redis.get.mockResolvedValue('{not-json');

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.SESSION_EXPIRED);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('세션이 없으면 기존 FORBIDDEN 오류를 반환함', async () => {
    const { guard, redis } = createGuard(USER_STATUS.LOGIN);
    redis.get.mockResolvedValue(null);

    await expectAuthCode(guard.canActivate(createContext()), AuthErrorCode.FORBIDDEN);

    expect(redis.expireat).not.toHaveBeenCalled();
  });
});

describe('SeatsGateway 상태별 접근 정책', () => {
  it.each([USER_STATUS.ENTERING, USER_STATUS.SELECTING_SEAT])(
    '%s 상태와 이벤트가 일치하면 접근을 허용하고 TTL을 갱신함',
    async (userStatus) => {
      const { gateway, redis } = createGateway();
      redis.get.mockResolvedValue(JSON.stringify({ userStatus, roles: [USER_ROLE.USER], targetEvent: 1 }));

      await expect(gateway.authorize('sid-1', 1)).resolves.toBe(true);

      expect(redis.expireat).toHaveBeenCalledWith('user:sid-1', expect.any(Number));
    },
  );

  it('ADMIN 역할만 가진 세션은 벤치마크 좌석 접근을 거부함', async () => {
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

  it('폐기된 ADMIN 상태는 벤치마크 좌석 접근을 거부함', async () => {
    const { gateway, redis } = createGateway();
    const staleAdminState = USER_ROLE.ADMIN;
    redis.get.mockResolvedValue(JSON.stringify({ userStatus: staleAdminState, targetEvent: 1 }));

    await expect(gateway.authorize('sid-1', 1)).resolves.toBe(false);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('상태가 일치해도 targetEvent가 다르면 접근을 거부함', async () => {
    const { gateway, redis } = createGateway();
    redis.get.mockResolvedValue(JSON.stringify({ userStatus: USER_STATUS.SELECTING_SEAT, targetEvent: 2 }));

    await expect(gateway.authorize('sid-1', 1)).resolves.toBe(false);

    expect(redis.expireat).not.toHaveBeenCalled();
  });

  it('손상된 세션 JSON은 접근을 거부함', async () => {
    const { gateway, redis } = createGateway();
    redis.get.mockResolvedValue('{not-json');

    await expect(gateway.authorize('sid-1', 1)).resolves.toBe(false);

    expect(redis.expireat).not.toHaveBeenCalled();
  });
});
