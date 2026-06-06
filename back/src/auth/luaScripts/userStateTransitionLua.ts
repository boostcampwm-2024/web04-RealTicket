import Redis from 'ioredis';

import {
  mapLuaUserStateTransitionResult,
  type LuaUserStateTransitionInput,
  type LuaUserStateTransitionRawResult,
  type LuaUserStateTransitionResult,
} from '../fsm/user-state-transition.contract';

const userStateTransitionLua = `
  local sessionKey = KEYS[1]

  local expectedFromMode = ARGV[1]
  local expectedFromValue = ARGV[2]
  local nextTo = ARGV[3]
  local targetEventPatchMode = ARGV[4]
  local targetEventPatchValue = ARGV[5]
  local expectedTargetEventMode = ARGV[6]
  local expectedTargetEventValue = ARGV[7]

  local raw = redis.call('GET', sessionKey)
  if not raw then
    return {'SESSION_MISSING'}
  end

  local session = cjson.decode(raw)

  if expectedFromMode == 'value' and session.userStatus ~= expectedFromValue then
    return {'STATE_MISMATCH', session.userStatus}
  end

  if expectedTargetEventMode ~= 'none' then
    if expectedTargetEventMode == 'null' then
      if session.targetEvent ~= cjson.null then
        return {'TARGET_EVENT_MISMATCH', session.targetEvent}
      end
    else
      local expectedTargetEvent = tonumber(expectedTargetEventValue)
      if session.targetEvent ~= expectedTargetEvent then
        return {'TARGET_EVENT_MISMATCH', session.targetEvent}
      end
    end
  end

  session.userStatus = nextTo

  if targetEventPatchMode == 'set' then
    session.targetEvent = tonumber(targetEventPatchValue)
  elseif targetEventPatchMode == 'clear' then
    session.targetEvent = cjson.null
  end

  local encodedSession = cjson.encode(session)
  local ttl = redis.call('PTTL', sessionKey)
  if ttl == -2 or ttl == 0 then
    return {'SESSION_EXPIRED_DURING_WRITE'}
  end

  if ttl > 0 then
    redis.call('PSETEX', sessionKey, ttl, encodedSession)
  elseif ttl == -1 then
    redis.call('SET', sessionKey, encodedSession)
  else
    return {'SESSION_EXPIRED_DURING_WRITE'}
  end

  return {'OK'}
`;

type RedisWithUserStateTransitionCommand = Redis & {
  userStateTransition(
    sessionKey: string,
    expectedFromMode: string,
    expectedFromValue: string,
    nextTo: string,
    targetEventPatchMode: string,
    targetEventPatchValue: string,
    expectedTargetEventMode: string,
    expectedTargetEventValue: string,
  ): Promise<LuaUserStateTransitionRawResult>;
};

const commandRegisteredRedisSet = new WeakSet<object>();

function getUserStateTransitionCommandRedis(redis: Redis): RedisWithUserStateTransitionCommand {
  if (!commandRegisteredRedisSet.has(redis)) {
    redis.defineCommand('userStateTransition', {
      numberOfKeys: 1,
      lua: userStateTransitionLua,
    });
    commandRegisteredRedisSet.add(redis);
  }

  return redis as RedisWithUserStateTransitionCommand;
}

function getExpectedFromArgs(input: LuaUserStateTransitionInput): [string, string] {
  if (input.expectedFrom === undefined) {
    return ['none', ''];
  }

  return ['value', input.expectedFrom];
}

function getTargetEventPatchArgs(input: LuaUserStateTransitionInput): [string, string] {
  if (input.targetEventPatch.mode === 'set') {
    return ['set', String(input.targetEventPatch.eventId)];
  }

  return [input.targetEventPatch.mode, ''];
}

function getExpectedTargetEventArgs(input: LuaUserStateTransitionInput): [string, string] {
  if (input.expectedTargetEvent === undefined) {
    return ['none', ''];
  }

  if (input.expectedTargetEvent === null) {
    return ['null', ''];
  }

  return ['number', String(input.expectedTargetEvent)];
}

export async function runUserStateTransitionLua(
  redis: Redis,
  input: LuaUserStateTransitionInput,
): Promise<LuaUserStateTransitionResult> {
  const [expectedFromMode, expectedFromValue] = getExpectedFromArgs(input);
  const [targetEventPatchMode, targetEventPatchValue] = getTargetEventPatchArgs(input);
  const [expectedTargetEventMode, expectedTargetEventValue] = getExpectedTargetEventArgs(input);
  const commandRedis = getUserStateTransitionCommandRedis(redis);

  const rawResult = await commandRedis.userStateTransition(
    input.sessionKey,
    expectedFromMode,
    expectedFromValue,
    input.nextTo,
    targetEventPatchMode,
    targetEventPatchValue,
    expectedTargetEventMode,
    expectedTargetEventValue,
  );

  return mapLuaUserStateTransitionResult(rawResult, {
    action: input.action,
    expectedFrom: input.expectedFrom,
    nextTo: input.nextTo,
  });
}
