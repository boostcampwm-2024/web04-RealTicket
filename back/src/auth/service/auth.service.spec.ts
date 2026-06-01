import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

import { USER_ROLE } from '../../domains/user/const/userRole';
import { AUTH_EXPIRE_TIME } from '../const/authExpireTime.const';
import { USER_STATUS } from '../fsm/user-state.fsm';

import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

type SessionFixture = {
  id: number;
  loginId: string;
  userStatus: string;
  targetEvent: number | null;
  roles?: string[];
  nickname?: string;
};

type ExecResultFixture = Array<[Error | null, unknown]> | null;
type UserRepositoryMock = {
  findOne: jest.Mock;
  save: jest.Mock;
};

function createService(
  session: SessionFixture | null,
  execResult: ExecResultFixture = [[null, 'OK']],
  userRepositoryOverrides: Partial<UserRepositoryMock> = {},
) {
  const multi = {
    set: jest.fn().mockReturnThis(),
    zadd: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(execResult),
  };

  const redis = {
    duplicate: jest.fn().mockReturnThis(),
    watch: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(session ? JSON.stringify(session) : null),
    multi: jest.fn(() => multi),
    unwatch: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
    set: jest.fn(),
    unlink: jest.fn(),
    zadd: jest.fn(),
  };

  const redisService = {
    getOrThrow: jest.fn(() => redis),
  };

  const logger = {
    warn: jest.fn(),
    error: jest.fn(),
  };
  const userRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    ...userRepositoryOverrides,
  };

  return {
    service: new AuthService(redisService as never, userRepository as never, logger as never),
    redis,
    multi,
    logger,
    userRepository,
  };
}

function expectStoredUserSession(
  redis: { set: jest.Mock },
  sessionId: string,
  expectedSession: Record<string, unknown>,
) {
  const sessionSetCall = redis.set.mock.calls.find(([key]) => key === `user:${sessionId}`);
  expect(sessionSetCall).toBeDefined();
  const [, serializedSession, mode, ttl] = sessionSetCall!;
  expect(JSON.parse(serializedSession)).toEqual(expectedSession);
  expect(mode).toBe('EX');
  expect(ttl).toBe(AUTH_EXPIRE_TIME);
}

beforeEach(() => {
  jest.clearAllMocks();
  (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  (uuidv4 as jest.Mock).mockReturnValue('session-1');
});

describe('AuthService FSM session transitions', () => {
  it('writes a valid semantic transition with existing fields and KEEPTTL preserved', async () => {
    const session = {
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.LOGIN,
      targetEvent: null,
      nickname: 'kept',
    };
    const { service, redis, multi } = createService(session);

    await expect(service.enterBookingGate('sid-1', 7)).resolves.toEqual({
      ok: true,
      action: 'enterBookingGate',
      from: USER_STATUS.LOGIN,
      to: USER_STATUS.ENTERING,
    });

    expect(redis.watch).toHaveBeenCalledWith('user:sid-1');
    expect(multi.set).toHaveBeenCalledWith(
      'user:sid-1',
      JSON.stringify({ ...session, targetEvent: 7, userStatus: USER_STATUS.ENTERING }),
      'KEEPTTL',
    );
    expect(multi.exec).toHaveBeenCalledTimes(1);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it.each([
    [USER_STATUS.SELECTING_SEAT, 'INVALID_TRANSITION'],
    ['ADMIN', 'UNKNOWN_STATE'],
    ['BROKEN_STATE', 'UNKNOWN_STATE'],
  ])('does not write for rejected transition from %s', async (userStatus, reason) => {
    const { service, redis, multi } = createService({
      id: 1,
      loginId: 'user1',
      userStatus,
      targetEvent: 7,
    });

    await expect(service.enterBookingGate('sid-1', 8)).resolves.toEqual({
      ok: false,
      action: 'enterBookingGate',
      from: userStatus,
      to: USER_STATUS.ENTERING,
      reason,
    });

    expect(redis.unwatch).toHaveBeenCalledTimes(1);
    expect(multi.set).not.toHaveBeenCalled();
    expect(multi.exec).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('returns null when Redis CAS commit is lost', async () => {
    const { service, multi } = createService(
      {
        id: 1,
        loginId: 'user1',
        userStatus: USER_STATUS.LOGIN,
        targetEvent: null,
      },
      null,
    );

    await expect(service.enterWaiting('sid-1', 3)).resolves.toBeNull();

    expect(multi.set).toHaveBeenCalledWith(
      'user:sid-1',
      JSON.stringify({ id: 1, loginId: 'user1', userStatus: USER_STATUS.WAITING, targetEvent: 3 }),
      'KEEPTTL',
    );
    expect(multi.exec).toHaveBeenCalledTimes(1);
  });

  it('throws when Redis EXEC contains a command-level error', async () => {
    const commandError = new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    const session = {
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.LOGIN,
      targetEvent: null,
    };
    const { service, logger, multi } = createService(session, [
      [null, 1],
      [commandError, null],
    ]);

    await expect(
      service.enterBookingGate('sid-1', 7, {
        watchKeys: ['entering:7'],
        mutate: (multi) => {
          multi.zadd('entering:7', 1234, 'sid-1');
        },
      }),
    ).rejects.toThrow(commandError.message);

    expect(multi.zadd).toHaveBeenCalledWith('entering:7', 1234, 'sid-1');
    expect(multi.set).toHaveBeenCalledWith(
      'user:sid-1',
      JSON.stringify({ ...session, targetEvent: 7, userStatus: USER_STATUS.ENTERING }),
      'KEEPTTL',
    );
    expect(multi.exec).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('WRONGTYPE Operation'));
  });

  it('does not write session or side effects when a watched transition validation fails', async () => {
    const validate = jest.fn().mockResolvedValue(false);
    const mutate = jest.fn();
    const { service, redis, multi } = createService({
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.LOGIN,
      targetEvent: null,
    });

    await expect(
      service.enterBookingGate('sid-1', 7, {
        watchKeys: ['entering:7'],
        validate,
        mutate,
      }),
    ).resolves.toBeNull();

    expect(redis.watch).toHaveBeenCalledWith('user:sid-1', 'entering:7');
    expect(validate).toHaveBeenCalledTimes(1);
    expect(mutate).not.toHaveBeenCalled();
    expect(multi.set).not.toHaveBeenCalled();
    expect(multi.exec).not.toHaveBeenCalled();
  });

  it('does not expose legacy setUserStatus compatibility wrappers', () => {
    const { service } = createService(null);
    const legacyWrapperNames = [
      'setUserStatusLogin',
      'setUserStatusWaiting',
      'setUserStatusEntering',
      'setUserStatusSelectingSeat',
      'setUserStatusReconnectingSelecting',
      'setUserStatusAdmin',
    ];

    for (const wrapperName of legacyWrapperNames) {
      expect(wrapperName in service).toBe(false);
    }
  });

  it('semantic login reset writes explicit null targetEvent with KEEPTTL', async () => {
    const session = {
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.SELECTING_SEAT,
      targetEvent: 7,
    };
    const { service, multi } = createService(session);

    await expect(service.resetToLogin('sid-1', null)).resolves.toEqual({
      ok: true,
      action: 'resetToLogin',
      from: USER_STATUS.SELECTING_SEAT,
      to: USER_STATUS.LOGIN,
    });

    expect(multi.set).toHaveBeenCalledWith(
      'user:sid-1',
      JSON.stringify({ ...session, targetEvent: null, userStatus: USER_STATUS.LOGIN }),
      'KEEPTTL',
    );
  });
});

describe('AuthService session role persistence', () => {
  it('stores explicit USER role membership for normal registered users', async () => {
    const { service, redis, userRepository } = createService(null);
    userRepository.findOne.mockResolvedValue({
      id: 1,
      loginId: 'user1',
      loginPassword: 'hashed',
      role: USER_ROLE.USER,
    });

    await expect(service.validateUser('user1', 'password')).resolves.toEqual({
      sessionId: 'session-1',
      userInfo: expect.objectContaining({ loginId: 'user1' }),
    });

    expectStoredUserSession(redis, 'session-1', {
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.LOGIN,
      roles: [USER_ROLE.USER],
      targetEvent: null,
    });
  });

  it('stores explicit USER and ADMIN role membership for admin users', async () => {
    const { service, redis, userRepository } = createService(null);
    userRepository.findOne.mockResolvedValue({
      id: 2,
      loginId: 'admin1',
      loginPassword: 'hashed',
      role: USER_ROLE.ADMIN,
    });

    await expect(service.validateUser('admin1', 'password')).resolves.toEqual({
      sessionId: 'session-1',
      userInfo: expect.objectContaining({ loginId: 'admin1' }),
    });

    expectStoredUserSession(redis, 'session-1', {
      id: 2,
      loginId: 'admin1',
      userStatus: USER_STATUS.LOGIN,
      roles: [USER_ROLE.USER, USER_ROLE.ADMIN],
      targetEvent: null,
    });
  });

  it('stores explicit USER role membership for guest users', async () => {
    const { service, redis, userRepository } = createService(null);
    userRepository.save.mockResolvedValue({
      id: 3,
      loginId: 'guest-session-1',
      role: USER_ROLE.USER,
      checkGuest: true,
    });

    await expect(service.makeGuestUser()).resolves.toEqual({
      sessionId: 'session-1',
      userInfo: {
        id: 3,
        loginId: 'guest-session-1',
        userStatus: USER_STATUS.LOGIN,
        roles: [USER_ROLE.USER],
        targetEvent: null,
      },
    });

    expect(userRepository.save).toHaveBeenCalledWith({
      loginId: 'guest-session-1',
      role: USER_ROLE.USER,
      checkGuest: true,
    });
    expectStoredUserSession(redis, 'session-1', {
      id: 3,
      loginId: 'guest-session-1',
      userStatus: USER_STATUS.LOGIN,
      roles: [USER_ROLE.USER],
      targetEvent: null,
    });
  });
});
