import Redis from 'ioredis';

import {
  mapLuaUserStateTransitionResult,
  resolveUserStateTransition,
  type LuaUserStateTransitionRawResult,
  type LuaUserStateTransitionResult,
} from '../../../auth/fsm/user-state-transition.contract';
import { USER_STATUS } from '../../../auth/fsm/user-state.fsm';
import { sessionWriteLuaHelpers } from '../../../auth/luaScripts/sessionLuaHelpers';

export type ImmediateAdmissionBusinessCode = 'CAPACITY_FULL';

export type WaitingHeadPromotionBusinessCode =
  | 'CAPACITY_FULL'
  | 'QUEUE_EMPTY'
  | 'STALE_SESSION_MISSING'
  | 'STALE_STATE_MISMATCH'
  | 'STALE_TARGET_EVENT_MISMATCH';

export const IMMEDIATE_ADMISSION_BUSINESS_CODES = [
  'CAPACITY_FULL',
] as const satisfies readonly ImmediateAdmissionBusinessCode[];

export const WAITING_HEAD_PROMOTION_BUSINESS_CODES = [
  'CAPACITY_FULL',
  'QUEUE_EMPTY',
  'STALE_SESSION_MISSING',
  'STALE_STATE_MISMATCH',
  'STALE_TARGET_EVENT_MISMATCH',
] as const satisfies readonly WaitingHeadPromotionBusinessCode[];

export const IMMEDIATE_ADMISSION_TRANSITION = resolveUserStateTransition(
  'enterBookingGate',
  USER_STATUS.LOGIN,
);

export const WAITING_HEAD_PROMOTION_TRANSITION = resolveUserStateTransition(
  'enterBookingGate',
  USER_STATUS.WAITING,
);

export type ImmediateAdmissionLuaResult = LuaUserStateTransitionResult<ImmediateAdmissionBusinessCode>;

export type WaitingHeadPromotionLuaResult = LuaUserStateTransitionResult<WaitingHeadPromotionBusinessCode>;

export type AdmissionCapacityKeys = {
  enteringKey: string;
  inBookingSessionsKey: string;
  reconnectingKey: string;
  maxSizeKey: string;
  defaultMaxSizeKey: string;
};

export type ImmediateAdmissionLuaInput = {
  sessionKey: string;
  eventId: number;
  keys: AdmissionCapacityKeys;
  defaultMaxSize: number;
  nowMs: number;
};

export type WaitingHeadPromotionLuaInput = {
  waitingQueueKey: string;
  userKeyPrefix: string;
  eventId: number;
  keys: AdmissionCapacityKeys;
  defaultMaxSize: number;
  nowMs: number;
};

export const admissionCapacityLuaHelpers = `
  ${sessionWriteLuaHelpers}

  local function readPositiveNumber(key)
    local raw = redis.call('GET', key)
    if raw then
      return tonumber(raw)
    end
    return nil
  end

  local function getMaxSize(maxSizeKey, defaultMaxSizeKey, defaultMaxSizeFallback)
    local eventMaxSize = readPositiveNumber(maxSizeKey)
    if eventMaxSize then
      return eventMaxSize
    end

    local defaultMaxSize = readPositiveNumber(defaultMaxSizeKey)
    if defaultMaxSize then
      return defaultMaxSize
    end

    return tonumber(defaultMaxSizeFallback)
  end

  local function hasAdmissionCapacity(
    inBookingSessionsKey,
    reconnectingKey,
    enteringKey,
    maxSizeKey,
    defaultMaxSizeKey,
    defaultMaxSizeFallback
  )
    local inBookingCount = redis.call('HLEN', inBookingSessionsKey)
    local reconnectingCount = redis.call('ZCARD', reconnectingKey)
    local enteringCount = redis.call('ZCARD', enteringKey)
    local maxSize = getMaxSize(maxSizeKey, defaultMaxSizeKey, defaultMaxSizeFallback)

    return inBookingCount + reconnectingCount + enteringCount < maxSize
  end
`;

export const immediateAdmissionLua = `
  ${admissionCapacityLuaHelpers}

  local sessionKey = KEYS[1]
  local enteringKey = KEYS[2]
  local inBookingSessionsKey = KEYS[3]
  local reconnectingKey = KEYS[4]
  local maxSizeKey = KEYS[5]

  local eventId = tonumber(ARGV[1])
  local defaultMaxSizeKey = ARGV[2]
  local defaultMaxSizeFallback = ARGV[3]
  local nowMs = tonumber(ARGV[4])
  local expectedFrom = ARGV[5]
  local nextTo = ARGV[6]

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

  if not hasAdmissionCapacity(
    inBookingSessionsKey,
    reconnectingKey,
    enteringKey,
    maxSizeKey,
    defaultMaxSizeKey,
    defaultMaxSizeFallback
  ) then
    return {'CAPACITY_FULL'}
  end

  session.userStatus = nextTo
  session.targetEvent = eventId

  local encodedSession, ttl, prepareCode = prepareSessionWrite(sessionKey, session)
  if prepareCode ~= 'OK' then
    return {prepareCode}
  end

  local sid = string.sub(sessionKey, string.len('user:') + 1)
  redis.call('ZADD', enteringKey, nowMs, sid)
  writePreparedSessionPreservingTtl(sessionKey, encodedSession, ttl)

  return {'OK'}
`;

export const waitingHeadPromotionLua = `
  ${admissionCapacityLuaHelpers}

  local waitingQueueKey = KEYS[1]
  local enteringKey = KEYS[2]
  local inBookingSessionsKey = KEYS[3]
  local reconnectingKey = KEYS[4]
  local maxSizeKey = KEYS[5]
  local defaultMaxSizeKey = KEYS[6]

  local eventId = tonumber(ARGV[1])
  local userKeyPrefix = ARGV[2]
  local defaultMaxSizeFallback = ARGV[3]
  local nowMs = tonumber(ARGV[4])
  local expectedFrom = ARGV[5]
  local nextTo = ARGV[6]

  local head = redis.call('LINDEX', waitingQueueKey, 0)
  if not head then
    return {'QUEUE_EMPTY'}
  end

  local item = cjson.decode(head)
  local sid = item.sid

  if not hasAdmissionCapacity(
    inBookingSessionsKey,
    reconnectingKey,
    enteringKey,
    maxSizeKey,
    defaultMaxSizeKey,
    defaultMaxSizeFallback
  ) then
    return {'CAPACITY_FULL'}
  end

  local sessionKey = userKeyPrefix .. sid
  local raw = redis.call('GET', sessionKey)
  if not raw then
    redis.call('LPOP', waitingQueueKey)
    return {'STALE_SESSION_MISSING', sid}
  end

  local session = cjson.decode(raw)
  if session.userStatus ~= expectedFrom then
    redis.call('LPOP', waitingQueueKey)
    return {'STALE_STATE_MISMATCH', session.userStatus}
  end

  if session.targetEvent ~= eventId then
    redis.call('LPOP', waitingQueueKey)
    return {'STALE_TARGET_EVENT_MISMATCH', session.targetEvent}
  end

  session.userStatus = nextTo
  local encodedSession, ttl, prepareCode = prepareSessionWrite(sessionKey, session)
  if prepareCode ~= 'OK' then
    return {prepareCode}
  end

  redis.call('ZADD', enteringKey, nowMs, sid)
  redis.call('LPOP', waitingQueueKey)
  writePreparedSessionPreservingTtl(sessionKey, encodedSession, ttl)
  return {'OK'}
`;

type RedisWithAdmissionCapacityCommands = Redis & {
  admitBookingGateImmediate(
    sessionKey: string,
    enteringKey: string,
    inBookingSessionsKey: string,
    reconnectingKey: string,
    maxSizeKey: string,
    eventId: string,
    defaultMaxSizeKey: string,
    defaultMaxSize: string,
    nowMs: string,
    expectedFrom: string,
    nextTo: string,
  ): Promise<LuaUserStateTransitionRawResult<ImmediateAdmissionBusinessCode>>;

  promoteWaitingQueueHead(
    waitingQueueKey: string,
    enteringKey: string,
    inBookingSessionsKey: string,
    reconnectingKey: string,
    maxSizeKey: string,
    defaultMaxSizeKey: string,
    eventId: string,
    userKeyPrefix: string,
    defaultMaxSize: string,
    nowMs: string,
    expectedFrom: string,
    nextTo: string,
  ): Promise<LuaUserStateTransitionRawResult<WaitingHeadPromotionBusinessCode>>;
};

const commandRegisteredRedisSet = new WeakSet<object>();

function getAdmissionCapacityCommandRedis(redis: Redis): RedisWithAdmissionCapacityCommands {
  if (!commandRegisteredRedisSet.has(redis)) {
    redis.defineCommand('admitBookingGateImmediate', {
      numberOfKeys: 5,
      lua: immediateAdmissionLua,
    });
    redis.defineCommand('promoteWaitingQueueHead', {
      numberOfKeys: 6,
      lua: waitingHeadPromotionLua,
    });
    commandRegisteredRedisSet.add(redis);
  }

  return redis as RedisWithAdmissionCapacityCommands;
}

export function mapImmediateAdmissionLuaResult(
  raw: LuaUserStateTransitionRawResult<ImmediateAdmissionBusinessCode>,
): ImmediateAdmissionLuaResult {
  return mapLuaUserStateTransitionResult(raw, {
    action: IMMEDIATE_ADMISSION_TRANSITION.action,
    expectedFrom: IMMEDIATE_ADMISSION_TRANSITION.from,
    nextTo: IMMEDIATE_ADMISSION_TRANSITION.to,
    businessCodes: IMMEDIATE_ADMISSION_BUSINESS_CODES,
  });
}

export function mapWaitingHeadPromotionLuaResult(
  raw: LuaUserStateTransitionRawResult<WaitingHeadPromotionBusinessCode>,
): WaitingHeadPromotionLuaResult {
  return mapLuaUserStateTransitionResult(raw, {
    action: WAITING_HEAD_PROMOTION_TRANSITION.action,
    expectedFrom: WAITING_HEAD_PROMOTION_TRANSITION.from,
    nextTo: WAITING_HEAD_PROMOTION_TRANSITION.to,
    businessCodes: WAITING_HEAD_PROMOTION_BUSINESS_CODES,
  });
}

export async function runImmediateAdmissionLua(
  redis: Redis,
  input: ImmediateAdmissionLuaInput,
): Promise<ImmediateAdmissionLuaResult> {
  const commandRedis = getAdmissionCapacityCommandRedis(redis);
  const rawResult = await commandRedis.admitBookingGateImmediate(
    input.sessionKey,
    input.keys.enteringKey,
    input.keys.inBookingSessionsKey,
    input.keys.reconnectingKey,
    input.keys.maxSizeKey,
    String(input.eventId),
    input.keys.defaultMaxSizeKey,
    String(input.defaultMaxSize),
    String(input.nowMs),
    IMMEDIATE_ADMISSION_TRANSITION.from,
    IMMEDIATE_ADMISSION_TRANSITION.to,
  );

  return mapImmediateAdmissionLuaResult(rawResult);
}

export async function runWaitingHeadPromotionLua(
  redis: Redis,
  input: WaitingHeadPromotionLuaInput,
): Promise<WaitingHeadPromotionLuaResult> {
  const commandRedis = getAdmissionCapacityCommandRedis(redis);
  const rawResult = await commandRedis.promoteWaitingQueueHead(
    input.waitingQueueKey,
    input.keys.enteringKey,
    input.keys.inBookingSessionsKey,
    input.keys.reconnectingKey,
    input.keys.maxSizeKey,
    input.keys.defaultMaxSizeKey,
    String(input.eventId),
    input.userKeyPrefix,
    String(input.defaultMaxSize),
    String(input.nowMs),
    WAITING_HEAD_PROMOTION_TRANSITION.from,
    WAITING_HEAD_PROMOTION_TRANSITION.to,
  );

  return mapWaitingHeadPromotionLuaResult(rawResult);
}
