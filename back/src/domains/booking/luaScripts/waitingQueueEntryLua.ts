import Redis from 'ioredis';

import {
  mapLuaUserStateTransitionResult,
  resolveUserStateTransition,
  type LuaUserStateTransitionRawResult,
  type LuaUserStateTransitionResult,
} from '../../../auth/fsm/user-state-transition.contract';
import { USER_STATUS } from '../../../auth/fsm/user-state.fsm';
import { sessionWriteLuaHelpers } from '../../../auth/luaScripts/sessionLuaHelpers';

export const ENTER_WAITING_TRANSITION = resolveUserStateTransition('enterWaiting', USER_STATUS.LOGIN);

export type WaitingQueueEntryLuaInput = {
  sessionKey: string;
  waitingQueueKey: string;
  waitingOrderKey: string;
  eventId: number;
  sid: string;
};

export type WaitingQueueEntryLuaResult = {
  transition: LuaUserStateTransitionResult;
  order: number | null;
};

export const waitingQueueEntryLua = `
  ${sessionWriteLuaHelpers}

  local sessionKey = KEYS[1]
  local waitingQueueKey = KEYS[2]
  local waitingOrderKey = KEYS[3]

  local eventId = tonumber(ARGV[1])
  local sid = ARGV[2]
  local expectedFrom = ARGV[3]
  local nextTo = ARGV[4]

  local raw = redis.call('GET', sessionKey)
  if not raw then
    return {'SESSION_MISSING'}
  end

  local session = cjson.decode(raw)
  if session.userStatus ~= expectedFrom then
    return {'STATE_MISMATCH', session.userStatus}
  end

  if session.targetEvent ~= cjson.null then
    return {'TARGET_EVENT_MISMATCH', session.targetEvent}
  end

  local order = redis.call('INCR', waitingOrderKey)

  session.userStatus = nextTo
  session.targetEvent = eventId
  session.waitingOrder = order

  local encodedSession, ttl, prepareCode = prepareSessionWrite(sessionKey, session)
  if prepareCode ~= 'OK' then
    return {prepareCode}
  end

  redis.call('RPUSH', waitingQueueKey, cjson.encode({sid = sid, order = order}))
  writePreparedSessionPreservingTtl(sessionKey, encodedSession, ttl)

  return {'OK', order}
`;

type RedisWithWaitingQueueEntryCommand = Redis & {
  enterWaitingQueue(
    sessionKey: string,
    waitingQueueKey: string,
    waitingOrderKey: string,
    eventId: string,
    sid: string,
    expectedFrom: string,
    nextTo: string,
  ): Promise<LuaUserStateTransitionRawResult>;
};

const commandRegisteredRedisSet = new WeakSet<object>();

function getWaitingQueueEntryCommandRedis(redis: Redis): RedisWithWaitingQueueEntryCommand {
  if (!commandRegisteredRedisSet.has(redis)) {
    redis.defineCommand('enterWaitingQueue', {
      numberOfKeys: 3,
      lua: waitingQueueEntryLua,
    });
    commandRegisteredRedisSet.add(redis);
  }

  return redis as RedisWithWaitingQueueEntryCommand;
}

export function mapWaitingQueueEntryLuaResult(
  raw: LuaUserStateTransitionRawResult,
): WaitingQueueEntryLuaResult {
  const transition = mapLuaUserStateTransitionResult(raw, {
    action: ENTER_WAITING_TRANSITION.action,
    expectedFrom: ENTER_WAITING_TRANSITION.from,
    nextTo: ENTER_WAITING_TRANSITION.to,
  });

  if (!transition.ok) {
    return { transition, order: null };
  }

  const rawOrder = Array.isArray(raw) ? raw[1] : undefined;
  const order = Number(rawOrder);

  if (!Number.isInteger(order)) {
    throw new TypeError('대기열 진입 Lua는 성공 시 정수 순번을 함께 반환해야 함');
  }

  return { transition, order };
}

export async function runWaitingQueueEntryLua(
  redis: Redis,
  input: WaitingQueueEntryLuaInput,
): Promise<WaitingQueueEntryLuaResult> {
  const commandRedis = getWaitingQueueEntryCommandRedis(redis);
  const rawResult = await commandRedis.enterWaitingQueue(
    input.sessionKey,
    input.waitingQueueKey,
    input.waitingOrderKey,
    String(input.eventId),
    input.sid,
    ENTER_WAITING_TRANSITION.from,
    ENTER_WAITING_TRANSITION.to,
  );

  return mapWaitingQueueEntryLuaResult(rawResult);
}
