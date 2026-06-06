import { readFileSync } from 'fs';
import { join } from 'path';

import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import {
  buildLuaUserStateTransitionInput,
  type LuaUserStateTransitionInput,
  type LuaUserStateTransitionRawResult,
} from '../fsm/user-state-transition.contract';
import { USER_STATUS } from '../fsm/user-state.fsm';

import { runUserStateTransitionLua } from './userStateTransitionLua';

const baseSession = {
  id: 1,
  loginId: 'guest-1',
  roles: ['USER'],
  targetEvent: null,
  userStatus: USER_STATUS.LOGIN,
};

type RedisWithStubbedCommand = Redis & {
  userStateTransition?: jest.Mock;
};
type UserStateTransitionCommandArgs = [
  sessionKey: string,
  expectedFromMode: string,
  expectedFromValue: string,
  nextTo: string,
  targetEventPatchMode: string,
  targetEventPatchValue: string,
  expectedTargetEventMode: string,
  expectedTargetEventValue: string,
];

function buildInput(overrides: Partial<LuaUserStateTransitionInput> = {}): LuaUserStateTransitionInput {
  const input = buildLuaUserStateTransitionInput({
    sid: 'sid-1',
    action: 'enterWaiting',
    expectedFrom: USER_STATUS.LOGIN,
    targetEventPatch: { mode: 'set', eventId: 42 },
    expectedTargetEvent: null,
  });

  if (!('sessionKey' in input)) {
    throw new Error('유효한 Lua 전이 입력이어야 함');
  }

  return { ...input, ...overrides };
}

async function emulateUserStateTransitionCommand(
  redis: Redis,
  ...[
    sessionKey,
    expectedFromMode,
    expectedFromValue,
    nextTo,
    targetEventPatchMode,
    targetEventPatchValue,
    expectedTargetEventMode,
    expectedTargetEventValue,
  ]: UserStateTransitionCommandArgs
): Promise<LuaUserStateTransitionRawResult> {
  const raw = await redis.get(sessionKey);
  if (!raw) {
    return ['SESSION_MISSING'];
  }

  const session = JSON.parse(raw) as Record<string, unknown>;

  if (expectedFromMode === 'value' && session.userStatus !== expectedFromValue) {
    return ['STATE_MISMATCH', session.userStatus];
  }

  if (expectedTargetEventMode !== 'none') {
    const expectedTargetEvent =
      expectedTargetEventMode === 'null' ? null : Number(expectedTargetEventValue);

    if (session.targetEvent !== expectedTargetEvent) {
      return ['TARGET_EVENT_MISMATCH', session.targetEvent];
    }
  }

  session.userStatus = nextTo;

  if (targetEventPatchMode === 'set') {
    session.targetEvent = Number(targetEventPatchValue);
  } else if (targetEventPatchMode === 'clear') {
    session.targetEvent = null;
  }

  const ttl = await redis.pttl(sessionKey);
  if (ttl === -2 || ttl === 0) {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }

  if (ttl > 0) {
    await redis.set(sessionKey, JSON.stringify(session), 'PX', ttl);
  } else if (ttl === -1) {
    await redis.set(sessionKey, JSON.stringify(session));
  } else {
    return ['SESSION_EXPIRED_DURING_WRITE'];
  }

  return ['OK'];
}

function installUserStateTransitionCommandStub(redis: Redis): jest.SpyInstance {
  return jest.spyOn(redis, 'defineCommand').mockImplementation(function (
    this: RedisWithStubbedCommand,
    name: string,
  ) {
    this[name as 'userStateTransition'] = jest.fn((...args: UserStateTransitionCommandArgs) =>
      emulateUserStateTransitionCommand(redis, ...args),
    );

    return this;
  } as never);
}

describe('runUserStateTransitionLua 실행', () => {
  let redis: Redis;
  let defineCommandSpy: jest.SpyInstance;

  beforeEach(() => {
    redis = new RedisMock() as unknown as Redis;
    defineCommandSpy = installUserStateTransitionCommandStub(redis);
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it('사용자 세션이 없으면 SESSION_MISSING을 반환함', async () => {
    const result = await runUserStateTransitionLua(redis, buildInput());

    expect(result).toMatchObject({
      ok: false,
      code: 'SESSION_MISSING',
      action: 'enterWaiting',
      expectedFrom: USER_STATUS.LOGIN,
      nextTo: USER_STATUS.WAITING,
    });
  });

  it.each(['{broken-json'])(
    '문법이 깨진 세션 JSON은 typed 결과로 변환하지 않고 throw함: %s',
    async (payload) => {
      const input = buildInput();
      await redis.set(input.sessionKey, payload);

      await expect(runUserStateTransitionLua(redis, input)).rejects.toThrow();
      expect(await redis.get(input.sessionKey)).toBe(payload);
    },
  );

  it('저장된 userStatus가 expectedFrom과 다르면 쓰기 없이 STATE_MISMATCH를 반환함', async () => {
    const input = buildInput();
    const session = { ...baseSession, targetEvent: null, userStatus: USER_STATUS.ENTERING };
    await redis.set(input.sessionKey, JSON.stringify(session));

    const result = await runUserStateTransitionLua(redis, input);

    expect(result).toMatchObject({ ok: false, code: 'STATE_MISMATCH' });
    expect(JSON.parse((await redis.get(input.sessionKey)) ?? '{}')).toEqual(session);
  });

  it('expectedFrom을 생략하면 현재 상태 비교만 건너뛰고 explicit nextTo를 저장함', async () => {
    const input = buildInput({
      action: 'resetToLogin',
      expectedFrom: undefined,
      nextTo: USER_STATUS.LOGIN,
      targetEventPatch: { mode: 'clear' },
      expectedTargetEvent: 7,
    });
    await redis.set(
      input.sessionKey,
      JSON.stringify({ ...baseSession, targetEvent: 7, userStatus: USER_STATUS.SELECTING_SEAT }),
    );

    const result = await runUserStateTransitionLua(redis, input);

    expect(result).toEqual({
      ok: true,
      code: 'OK',
      action: 'resetToLogin',
      to: USER_STATUS.LOGIN,
    });
    expect(JSON.parse((await redis.get(input.sessionKey)) ?? '{}')).toMatchObject({
      targetEvent: null,
      userStatus: USER_STATUS.LOGIN,
    });
  });

  it('expectedFrom을 생략해도 세션이 없으면 SESSION_MISSING을 반환함', async () => {
    const result = await runUserStateTransitionLua(
      redis,
      buildInput({ expectedFrom: undefined, nextTo: USER_STATUS.LOGIN }),
    );

    expect(result).toMatchObject({
      ok: false,
      code: 'SESSION_MISSING',
      action: 'enterWaiting',
      nextTo: USER_STATUS.LOGIN,
    });
    expect(result).not.toHaveProperty('expectedFrom');
  });

  it('expectedFrom을 생략해도 targetEvent 검증은 유지함', async () => {
    const input = buildInput({
      expectedFrom: undefined,
      expectedTargetEvent: 99,
    });
    const session = { ...baseSession, targetEvent: 42, userStatus: USER_STATUS.ENTERING };
    await redis.set(input.sessionKey, JSON.stringify(session));

    const result = await runUserStateTransitionLua(redis, input);

    expect(result).toMatchObject({ ok: false, code: 'TARGET_EVENT_MISMATCH' });
    expect(result).not.toHaveProperty('expectedFrom');
    expect(JSON.parse((await redis.get(input.sessionKey)) ?? '{}')).toEqual(session);
  });

  it('기대 targetEvent가 다르면 쓰기 없이 TARGET_EVENT_MISMATCH를 반환함', async () => {
    const input = buildInput({ expectedTargetEvent: 99 });
    const session = { ...baseSession, targetEvent: 42 };
    await redis.set(input.sessionKey, JSON.stringify(session));

    const result = await runUserStateTransitionLua(redis, input);

    expect(result).toMatchObject({ ok: false, code: 'TARGET_EVENT_MISMATCH' });
    expect(JSON.parse((await redis.get(input.sessionKey)) ?? '{}')).toEqual(session);
  });

  it('성공한 상태 전이를 set targetEvent 패치와 함께 저장함', async () => {
    const input = buildInput();
    await redis.set(input.sessionKey, JSON.stringify(baseSession));

    const result = await runUserStateTransitionLua(redis, input);

    expect(result).toEqual({
      ok: true,
      code: 'OK',
      action: 'enterWaiting',
      from: USER_STATUS.LOGIN,
      to: USER_STATUS.WAITING,
    });
    expect(JSON.parse((await redis.get(input.sessionKey)) ?? '{}')).toEqual({
      ...baseSession,
      targetEvent: 42,
      userStatus: USER_STATUS.WAITING,
    });
  });

  it('패치 모드가 preserve이면 targetEvent를 유지함', async () => {
    const input = buildInput({
      expectedTargetEvent: 7,
      targetEventPatch: { mode: 'preserve' },
    });
    await redis.set(input.sessionKey, JSON.stringify({ ...baseSession, targetEvent: 7 }));

    await runUserStateTransitionLua(redis, input);

    expect(JSON.parse((await redis.get(input.sessionKey)) ?? '{}')).toMatchObject({
      targetEvent: 7,
      userStatus: USER_STATUS.WAITING,
    });
  });

  it('패치 모드가 clear이면 targetEvent를 null로 비움', async () => {
    const input = buildInput({
      expectedTargetEvent: 7,
      targetEventPatch: { mode: 'clear' },
    });
    await redis.set(input.sessionKey, JSON.stringify({ ...baseSession, targetEvent: 7 }));

    await runUserStateTransitionLua(redis, input);

    expect(JSON.parse((await redis.get(input.sessionKey)) ?? '{}')).toMatchObject({
      targetEvent: null,
      userStatus: USER_STATUS.WAITING,
    });
  });

  it('Redis Lua 명령 실패는 인프라 실패로 throw함', async () => {
    const error = new Error('Lua 명령 실패');
    const failingRedis = {
      defineCommand: jest.fn(function (this: RedisWithStubbedCommand, name: string) {
        this[name as 'userStateTransition'] = jest.fn().mockRejectedValue(error);
        return this;
      }),
    } as unknown as Redis;

    await expect(runUserStateTransitionLua(failingRedis, buildInput())).rejects.toThrow(error);
  });

  it('양수 세션 TTL을 갱신하지 않고 보존함', async () => {
    const input = buildInput();
    await redis.set(input.sessionKey, JSON.stringify(baseSession), 'PX', 5000);
    const before = await redis.pttl(input.sessionKey);

    await runUserStateTransitionLua(redis, input);

    const after = await redis.pttl(input.sessionKey);
    expect(before).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);
    expect(after).toBeLessThanOrEqual(5000);
  });

  it('만료 없는 세션은 전이 후에도 만료 없음으로 유지함', async () => {
    const input = buildInput();
    await redis.set(input.sessionKey, JSON.stringify(baseSession));

    await runUserStateTransitionLua(redis, input);

    expect(await redis.ttl(input.sessionKey)).toBe(-1);
  });

  it('SESSION_EXPIRED_DURING_WRITE를 타입화된 거부 결과로 매핑함', async () => {
    const expiringRedis = {
      defineCommand: jest.fn(function (this: RedisWithStubbedCommand, name: string) {
        this[name as 'userStateTransition'] = jest
          .fn()
          .mockResolvedValue(['SESSION_EXPIRED_DURING_WRITE']);
        return this;
      }),
    } as unknown as Redis;

    await expect(runUserStateTransitionLua(expiringRedis, buildInput())).resolves.toMatchObject({
      ok: false,
      code: 'SESSION_EXPIRED_DURING_WRITE',
    });
  });

  it('같은 Redis 인스턴스에서는 Lua 명령을 한 번만 등록함', async () => {
    const input = buildInput();
    await redis.set(input.sessionKey, JSON.stringify(baseSession));
    await runUserStateTransitionLua(redis, input);
    await redis.set(input.sessionKey, JSON.stringify(baseSession));

    await runUserStateTransitionLua(redis, input);

    expect(defineCommandSpy).toHaveBeenCalledTimes(1);
    expect(defineCommandSpy).toHaveBeenCalledWith('userStateTransition', {
      numberOfKeys: 1,
      lua: expect.stringContaining('local session = cjson.decode(raw)'),
    });
  });

  it('Lua 소스에서 mock JSON fallback과 직접 eval 호출을 제거함', () => {
    const source = readFileSync(join(__dirname, 'userStateTransitionLua.ts'), 'utf8');
    const removedHotPathTerms = [
      'MALFORMED_' + 'SESSION',
      'MOCK_JSON_' + 'NULL',
      'decodeSession' + 'Json',
      'replaceJson' + 'Field',
      'has' + 'Cjson',
    ];

    for (const removedTerm of removedHotPathTerms) {
      expect(source).not.toContain(removedTerm);
    }
    expect(source).not.toMatch(/redis\.eval\(\s*userStateTransitionLua/);
    expect(source).toContain("redis.defineCommand('userStateTransition'");
    expect(source).toContain("return {'OK'}");
  });

  it('0 PTTL을 만료 없는 세션 분기로 처리하지 않음', () => {
    const source = readFileSync(join(__dirname, 'userStateTransitionLua.ts'), 'utf8');

    expect(source).toContain('if ttl == -2 or ttl == 0 then');
    expect(source).toContain('elseif ttl == -1 then');
  });
});
