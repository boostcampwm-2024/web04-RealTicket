import { readFileSync } from 'fs';
import { join } from 'path';

import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

import { AppException } from '../../common/exception/app.exception';
import { USER_ROLE } from '../../domains/user/const/userRole';
import { AUTH_EXPIRE_TIME } from '../const/authExpireTime.const';
import { AuthErrorCode } from '../exception/auth-error-code';
import { USER_STATUS } from '../fsm/user-state.fsm';
import { runUserStateTransitionLua } from '../luaScripts/userStateTransitionLua';

import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
}));

jest.mock('uuid', () => ({
  v4: jest.fn(),
}));

jest.mock('../luaScripts/userStateTransitionLua', () => ({
  runUserStateTransitionLua: jest.fn(),
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

const mockedRunUserStateTransitionLua = runUserStateTransitionLua as jest.MockedFunction<
  typeof runUserStateTransitionLua
>;

describe('AuthService FSM 세션 전이', () => {
  it('enterWaiting은 set targetEvent 패치 모드로 Lua를 호출함', async () => {
    const session = {
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.LOGIN,
      targetEvent: null,
      nickname: 'kept',
    };
    const { service, redis, multi } = createService(session);
    mockedRunUserStateTransitionLua.mockResolvedValue({
      ok: true,
      code: 'OK',
      action: 'enterWaiting',
      from: USER_STATUS.LOGIN,
      to: USER_STATUS.WAITING,
    });

    await expect(service.enterWaiting('sid-1', 7)).resolves.toEqual({
      ok: true,
      code: 'OK',
      action: 'enterWaiting',
      from: USER_STATUS.LOGIN,
      to: USER_STATUS.WAITING,
    });

    expect(mockedRunUserStateTransitionLua).toHaveBeenCalledWith(redis, {
      sessionKey: 'user:sid-1',
      action: 'enterWaiting',
      expectedFrom: USER_STATUS.LOGIN,
      nextTo: USER_STATUS.WAITING,
      targetEventPatch: { mode: 'set', eventId: 7 },
      expectedTargetEvent: null,
    });
    expect(redis.watch).not.toHaveBeenCalled();
    expect(multi.set).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('enterBookingGate는 targetEvent를 유지하고 WAITING 시작 상태로 Lua를 호출함', async () => {
    const { service, redis, multi } = createService({
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.WAITING,
      targetEvent: 7,
    });
    mockedRunUserStateTransitionLua.mockResolvedValue({
      ok: true,
      code: 'OK',
      action: 'enterBookingGate',
      from: USER_STATUS.WAITING,
      to: USER_STATUS.ENTERING,
    });

    await expect(service.enterBookingGate('sid-1')).resolves.toMatchObject({
      ok: true,
      code: 'OK',
      action: 'enterBookingGate',
      from: USER_STATUS.WAITING,
      to: USER_STATUS.ENTERING,
    });

    expect(mockedRunUserStateTransitionLua).toHaveBeenCalledWith(redis, {
      sessionKey: 'user:sid-1',
      action: 'enterBookingGate',
      expectedFrom: USER_STATUS.WAITING,
      nextTo: USER_STATUS.ENTERING,
      targetEventPatch: { mode: 'preserve' },
      expectedTargetEvent: 7,
    });
    expect(multi.set).not.toHaveBeenCalled();
  });

  it('WAITING에서 예매 진입 시 호출자 event를 expectedTargetEvent로 전달함', async () => {
    const { service, redis } = createService({
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.WAITING,
      targetEvent: 8,
    });
    mockedRunUserStateTransitionLua.mockResolvedValue({
      ok: false,
      code: 'TARGET_EVENT_MISMATCH',
      action: 'enterBookingGate',
      expectedFrom: USER_STATUS.WAITING,
      nextTo: USER_STATUS.ENTERING,
      details: [8],
    });

    await expect(service.enterBookingGate('sid-1', 7)).resolves.toEqual({
      ok: false,
      code: 'TARGET_EVENT_MISMATCH',
      action: 'enterBookingGate',
      expectedFrom: USER_STATUS.WAITING,
      nextTo: USER_STATUS.ENTERING,
      details: [8],
    });

    expect(mockedRunUserStateTransitionLua).toHaveBeenCalledWith(redis, {
      sessionKey: 'user:sid-1',
      action: 'enterBookingGate',
      expectedFrom: USER_STATUS.WAITING,
      nextTo: USER_STATUS.ENTERING,
      targetEventPatch: { mode: 'set', eventId: 7 },
      expectedTargetEvent: 7,
    });
  });

  it.each([
    ['startSeatSelection', USER_STATUS.ENTERING, USER_STATUS.SELECTING_SEAT],
    ['markReconnectingSelection', USER_STATUS.SELECTING_SEAT, USER_STATUS.RECONNECTING_SELECTING],
    ['restoreSeatSelection', USER_STATUS.RECONNECTING_SELECTING, USER_STATUS.SELECTING_SEAT],
  ] as const)('%s는 targetEvent를 유지하며 Lua를 호출함', async (methodName, from, to) => {
    const { service, redis } = createService({
      id: 1,
      loginId: 'user1',
      userStatus: from,
      targetEvent: 7,
    });
    mockedRunUserStateTransitionLua.mockResolvedValue({
      ok: true,
      code: 'OK',
      action: methodName,
      from,
      to,
    });

    await expect(service[methodName]('sid-1')).resolves.toMatchObject({
      ok: true,
      code: 'OK',
      action: methodName,
      from,
      to,
    });

    expect(mockedRunUserStateTransitionLua).toHaveBeenCalledWith(redis, {
      sessionKey: 'user:sid-1',
      action: methodName,
      expectedFrom: from,
      nextTo: to,
      targetEventPatch: { mode: 'preserve' },
      expectedTargetEvent: 7,
    });
  });

  it('skipExpectedFromCheck가 명시되면 현재 상태 비교 없이 Lua 입력을 생성함', async () => {
    const { service, redis, multi } = createService({
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.SELECTING_SEAT,
      targetEvent: 7,
    });
    mockedRunUserStateTransitionLua.mockResolvedValue({
      ok: true,
      code: 'OK',
      action: 'enterBookingGate',
      to: USER_STATUS.ENTERING,
    });

    await expect(service.enterBookingGate('sid-1', 7, { skipExpectedFromCheck: true })).resolves.toEqual({
      ok: true,
      code: 'OK',
      action: 'enterBookingGate',
      to: USER_STATUS.ENTERING,
    });

    expect(mockedRunUserStateTransitionLua).toHaveBeenCalledWith(redis, {
      sessionKey: 'user:sid-1',
      action: 'enterBookingGate',
      nextTo: USER_STATUS.ENTERING,
      targetEventPatch: { mode: 'set', eventId: 7 },
      expectedTargetEvent: 7,
    });
    expect(multi.set).not.toHaveBeenCalled();
  });

  it.each([
    [USER_STATUS.SELECTING_SEAT, 'INVALID_TRANSITION'],
    ['ADMIN', 'UNKNOWN_STATE'],
    ['BROKEN_STATE', 'UNKNOWN_STATE'],
  ])('%s에서 거부된 전이는 세션을 쓰지 않음', async (userStatus, reason) => {
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

    expect(redis.unwatch).not.toHaveBeenCalled();
    expect(multi.set).not.toHaveBeenCalled();
    expect(multi.exec).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
    expect(mockedRunUserStateTransitionLua).not.toHaveBeenCalled();
  });

  it('모든 전이가 Lua runner를 거치고 WATCH 트랜잭션을 열지 않음', async () => {
    const { service, redis, multi } = createService({
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.LOGIN,
      targetEvent: null,
    });
    mockedRunUserStateTransitionLua.mockResolvedValue({
      ok: true,
      code: 'OK',
      action: 'enterWaiting',
      from: USER_STATUS.LOGIN,
      to: USER_STATUS.WAITING,
    });

    await service.enterWaiting('sid-1', 3);

    expect(mockedRunUserStateTransitionLua).toHaveBeenCalledTimes(1);
    expect(redis.watch).not.toHaveBeenCalled();
    expect(redis.duplicate).not.toHaveBeenCalled();
    expect(multi.exec).not.toHaveBeenCalled();
  });

  it('AuthService에는 WATCH 기반 전이 경로가 남아 있지 않음', () => {
    const source = readFileSync(join(__dirname, 'auth.service.ts'), 'utf8');

    expect(source).not.toContain('executeWatchedUserStateTransition');
    expect(source).not.toContain('watchKeys');
    expect(source).not.toContain('.duplicate()');
    expect(source).not.toContain('redis.watch');
    expect(source).not.toContain("'KEEPTTL'");
  });

  it('기존 setUserStatus 호환 wrapper를 노출하지 않음', () => {
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

  it('raw setUserEventTarget 세션 패치를 노출하지 않음', () => {
    const { service } = createService(null);

    expect('setUserEventTarget' in service).toBe(false);
    expect('getUserEventTarget' in service).toBe(true);
  });

  it('의미 기반 login reset은 명시적인 null targetEvent를 KEEPTTL로 전달함', async () => {
    const session = {
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.SELECTING_SEAT,
      targetEvent: 7,
    };
    const { service, redis, multi } = createService(session);
    mockedRunUserStateTransitionLua.mockResolvedValue({
      ok: true,
      code: 'OK',
      action: 'resetToLogin',
      from: USER_STATUS.SELECTING_SEAT,
      to: USER_STATUS.LOGIN,
    });

    await expect(service.resetToLogin('sid-1', null)).resolves.toEqual({
      ok: true,
      code: 'OK',
      action: 'resetToLogin',
      from: USER_STATUS.SELECTING_SEAT,
      to: USER_STATUS.LOGIN,
    });

    expect(mockedRunUserStateTransitionLua).toHaveBeenCalledWith(redis, {
      sessionKey: 'user:sid-1',
      action: 'resetToLogin',
      expectedFrom: USER_STATUS.SELECTING_SEAT,
      nextTo: USER_STATUS.LOGIN,
      targetEventPatch: { mode: 'clear' },
      expectedTargetEvent: 7,
    });
    expect(multi.set).not.toHaveBeenCalled();
  });

  it('Redis Lua 인프라 실패를 로그로 남기고 다시 throw함', async () => {
    const error = new Error('ERR Error running script');
    const { service, logger } = createService({
      id: 1,
      loginId: 'user1',
      userStatus: USER_STATUS.LOGIN,
      targetEvent: null,
    });
    mockedRunUserStateTransitionLua.mockRejectedValue(error);

    await expect(service.enterWaiting('sid-1', 7)).rejects.toThrow(error.message);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Redis Lua user state transition failed during enterWaiting'),
    );
  });
});

describe('AuthService 세션 역할 저장', () => {
  it('비밀번호 검증이 실패하면 기존 세션을 제거하지 않음', async () => {
    const { service, redis, userRepository } = createService(null);
    redis.get.mockResolvedValue('old-session');
    userRepository.findOne.mockResolvedValue({
      id: 1,
      loginId: 'user1',
      loginPassword: 'hashed',
      role: USER_ROLE.USER,
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    try {
      await service.validateUser('user1', 'wrong-password');
      throw new Error('validateUser가 실패해야 함');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getCode()).toBe(AuthErrorCode.INVALID_CREDENTIALS);
    }

    expect(redis.unlink).not.toHaveBeenCalledWith('user:old-session');
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.zadd).not.toHaveBeenCalled();
  });

  it('일반 가입 사용자는 USER 역할을 명시적으로 저장함', async () => {
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

  it('관리자는 USER와 ADMIN 역할을 명시적으로 저장함', async () => {
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

  it('게스트 사용자는 USER 역할을 명시적으로 저장함', async () => {
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
