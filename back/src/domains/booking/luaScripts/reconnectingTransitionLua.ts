import Redis from 'ioredis';

import {
  mapLuaUserStateTransitionResult,
  type LuaUserStateTransitionRawResult,
  type LuaUserStateTransitionResult,
} from '../../../auth/fsm/user-state-transition.contract';
import { USER_STATUS } from '../../../auth/fsm/user-state.fsm';
import { sessionWriteLuaHelpers } from '../../../auth/luaScripts/sessionLuaHelpers';

export type RestoreSelectingBusinessCode = 'NOT_RECONNECTING';

export const RESTORE_SELECTING_BUSINESS_CODES = [
  'NOT_RECONNECTING',
] as const satisfies readonly RestoreSelectingBusinessCode[];

export type MarkReconnectingLuaResult = LuaUserStateTransitionResult;

export type RestoreSelectingLuaResult = LuaUserStateTransitionResult<RestoreSelectingBusinessCode>;

export type MarkReconnectingLuaInput = {
  sessionKey: string;
  reconnectingKey: string;
  eventId: number;
  sid: string;
  nowMs: number;
};

export type RestoreSelectingLuaInput = {
  sessionKey: string;
  reconnectingKey: string;
  eventId: number;
  sid: string;
};

export const markReconnectingLua = `
  ${sessionWriteLuaHelpers}

  local sessionKey = KEYS[1]
  local reconnectingKey = KEYS[2]

  local eventId = tonumber(ARGV[1])
  local sid = ARGV[2]
  local nowMs = tonumber(ARGV[3])

  local raw = redis.call('GET', sessionKey)
  if not raw then
    return {'SESSION_MISSING'}
  end

  local session = cjson.decode(raw)
  if session.userStatus ~= '${USER_STATUS.SELECTING_SEAT}' then
    return {'STATE_MISMATCH', session.userStatus}
  end

  if session.targetEvent ~= eventId then
    return {'TARGET_EVENT_MISMATCH', session.targetEvent}
  end

  session.userStatus = '${USER_STATUS.RECONNECTING_SELECTING}'

  local encodedSession, ttl, prepareCode = prepareSessionWrite(sessionKey, session)
  if prepareCode ~= 'OK' then
    return {prepareCode}
  end

  redis.call('ZADD', reconnectingKey, nowMs, sid)
  writePreparedSessionPreservingTtl(sessionKey, encodedSession, ttl)

  return {'OK'}
`;

export const restoreSelectingLua = `
  ${sessionWriteLuaHelpers}

  local sessionKey = KEYS[1]
  local reconnectingKey = KEYS[2]

  local eventId = tonumber(ARGV[1])
  local sid = ARGV[2]

  local raw = redis.call('GET', sessionKey)
  if not raw then
    return {'SESSION_MISSING'}
  end

  local session = cjson.decode(raw)
  if session.userStatus ~= '${USER_STATUS.RECONNECTING_SELECTING}' then
    return {'STATE_MISMATCH', session.userStatus}
  end

  if session.targetEvent ~= eventId then
    return {'TARGET_EVENT_MISMATCH', session.targetEvent}
  end

  session.userStatus = '${USER_STATUS.SELECTING_SEAT}'

  local encodedSession, ttl, prepareCode = prepareSessionWrite(sessionKey, session)
  if prepareCode ~= 'OK' then
    return {prepareCode}
  end

  if redis.call('ZREM', reconnectingKey, sid) ~= 1 then
    return {'NOT_RECONNECTING'}
  end

  writePreparedSessionPreservingTtl(sessionKey, encodedSession, ttl)

  return {'OK'}
`;

type RedisWithReconnectingTransitionCommands = Redis & {
  markReconnectingSelecting(
    sessionKey: string,
    reconnectingKey: string,
    eventId: string,
    sid: string,
    nowMs: string,
  ): Promise<LuaUserStateTransitionRawResult>;

  restoreSelectingSeat(
    sessionKey: string,
    reconnectingKey: string,
    eventId: string,
    sid: string,
  ): Promise<LuaUserStateTransitionRawResult<RestoreSelectingBusinessCode>>;
};

const commandRegisteredRedisSet = new WeakSet<object>();

function getReconnectingTransitionCommandRedis(redis: Redis): RedisWithReconnectingTransitionCommands {
  if (!commandRegisteredRedisSet.has(redis)) {
    redis.defineCommand('markReconnectingSelecting', {
      numberOfKeys: 2,
      lua: markReconnectingLua,
    });
    redis.defineCommand('restoreSelectingSeat', {
      numberOfKeys: 2,
      lua: restoreSelectingLua,
    });
    commandRegisteredRedisSet.add(redis);
  }

  return redis as RedisWithReconnectingTransitionCommands;
}

export function mapMarkReconnectingLuaResult(
  raw: LuaUserStateTransitionRawResult,
): MarkReconnectingLuaResult {
  return mapLuaUserStateTransitionResult(raw, {
    action: 'markReconnectingSelection',
    expectedFrom: USER_STATUS.SELECTING_SEAT,
    nextTo: USER_STATUS.RECONNECTING_SELECTING,
  });
}

export function mapRestoreSelectingLuaResult(
  raw: LuaUserStateTransitionRawResult<RestoreSelectingBusinessCode>,
): RestoreSelectingLuaResult {
  return mapLuaUserStateTransitionResult(raw, {
    action: 'restoreSeatSelection',
    expectedFrom: USER_STATUS.RECONNECTING_SELECTING,
    nextTo: USER_STATUS.SELECTING_SEAT,
    businessCodes: RESTORE_SELECTING_BUSINESS_CODES,
  });
}

export async function runMarkReconnectingLua(
  redis: Redis,
  input: MarkReconnectingLuaInput,
): Promise<MarkReconnectingLuaResult> {
  const commandRedis = getReconnectingTransitionCommandRedis(redis);
  const rawResult = await commandRedis.markReconnectingSelecting(
    input.sessionKey,
    input.reconnectingKey,
    String(input.eventId),
    input.sid,
    String(input.nowMs),
  );

  return mapMarkReconnectingLuaResult(rawResult);
}

export async function runRestoreSelectingLua(
  redis: Redis,
  input: RestoreSelectingLuaInput,
): Promise<RestoreSelectingLuaResult> {
  const commandRedis = getReconnectingTransitionCommandRedis(redis);
  const rawResult = await commandRedis.restoreSelectingSeat(
    input.sessionKey,
    input.reconnectingKey,
    String(input.eventId),
    input.sid,
  );

  return mapRestoreSelectingLuaResult(rawResult);
}
