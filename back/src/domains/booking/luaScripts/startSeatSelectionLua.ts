import Redis from 'ioredis';

import {
  mapLuaUserStateTransitionResult,
  resolveUserStateTransition,
  type LuaUserStateTransitionRawResult,
  type LuaUserStateTransitionResult,
} from '../../../auth/fsm/user-state-transition.contract';
import { USER_STATUS } from '../../../auth/fsm/user-state.fsm';
import { sessionWriteLuaHelpers } from '../../../auth/luaScripts/sessionLuaHelpers';

export type StartSeatSelectionBusinessCode = 'NOT_ENTERING';

export const START_SEAT_SELECTION_BUSINESS_CODES = [
  'NOT_ENTERING',
] as const satisfies readonly StartSeatSelectionBusinessCode[];

export const START_SEAT_SELECTION_TRANSITION = resolveUserStateTransition(
  'startSeatSelection',
  USER_STATUS.ENTERING,
);

export type StartSeatSelectionLuaResult = LuaUserStateTransitionResult<StartSeatSelectionBusinessCode>;

export type StartSeatSelectionLuaInput = {
  sessionKey: string;
  enteringKey: string;
  inBookingSessionsKey: string;
  bookingAmountKey: string;
  eventId: number;
  sid: string;
};

/**
 * in-booking 세션 JSON을 Lua에서 cjson으로 만들지 않는 이유:
 * Redis cjson은 빈 테이블을 배열이 아닌 객체(`{}`)로 인코딩해 `bookedSeats: []`가 깨진다.
 * 형태는 TypeScript가 정의하고 Lua는 조회한 예매 수량만 끼워 넣는다.
 */
export function buildInBookingSessionFragments(sid: string): { prefix: string; suffix: string } {
  return {
    prefix: `{"sid":${JSON.stringify(sid)},"bookingAmount":`,
    suffix: ',"bookedSeats":[],"saved":false,"subscribedSection":null}',
  };
}

export const startSeatSelectionLua = `
  ${sessionWriteLuaHelpers}

  local sessionKey = KEYS[1]
  local enteringKey = KEYS[2]
  local inBookingSessionsKey = KEYS[3]
  local bookingAmountKey = KEYS[4]

  local eventId = tonumber(ARGV[1])
  local sid = ARGV[2]
  local inBookingSessionPrefix = ARGV[3]
  local inBookingSessionSuffix = ARGV[4]
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

  if session.targetEvent ~= eventId then
    return {'TARGET_EVENT_MISMATCH', session.targetEvent}
  end

  local bookingAmount = 0
  local rawBookingAmount = redis.call('GET', bookingAmountKey)
  if rawBookingAmount then
    local parsedBookingAmount = tonumber(rawBookingAmount)
    if not parsedBookingAmount then
      -- 우리 코드만 쓰는 키이므로 숫자가 아니면 업무 거부가 아니라 시스템 불변식 위반으로 다룸.
      return {'CORRUPTED_BOOKING_AMOUNT'}
    end
    bookingAmount = math.floor(parsedBookingAmount)
  end

  session.userStatus = nextTo

  local encodedSession, ttl, prepareCode = prepareSessionWrite(sessionKey, session)
  if prepareCode ~= 'OK' then
    return {prepareCode}
  end

  if redis.call('ZREM', enteringKey, sid) ~= 1 then
    return {'NOT_ENTERING'}
  end

  redis.call('DEL', bookingAmountKey)
  redis.call(
    'HSET',
    inBookingSessionsKey,
    sid,
    inBookingSessionPrefix .. bookingAmount .. inBookingSessionSuffix
  )
  writePreparedSessionPreservingTtl(sessionKey, encodedSession, ttl)

  return {'OK'}
`;

type RedisWithStartSeatSelectionCommand = Redis & {
  startSeatSelectionFromEntering(
    sessionKey: string,
    enteringKey: string,
    inBookingSessionsKey: string,
    bookingAmountKey: string,
    eventId: string,
    sid: string,
    inBookingSessionPrefix: string,
    inBookingSessionSuffix: string,
    expectedFrom: string,
    nextTo: string,
  ): Promise<LuaUserStateTransitionRawResult<StartSeatSelectionBusinessCode>>;
};

const commandRegisteredRedisSet = new WeakSet<object>();

function getStartSeatSelectionCommandRedis(redis: Redis): RedisWithStartSeatSelectionCommand {
  if (!commandRegisteredRedisSet.has(redis)) {
    redis.defineCommand('startSeatSelectionFromEntering', {
      numberOfKeys: 4,
      lua: startSeatSelectionLua,
    });
    commandRegisteredRedisSet.add(redis);
  }

  return redis as RedisWithStartSeatSelectionCommand;
}

export function mapStartSeatSelectionLuaResult(
  raw: LuaUserStateTransitionRawResult<StartSeatSelectionBusinessCode>,
): StartSeatSelectionLuaResult {
  return mapLuaUserStateTransitionResult(raw, {
    action: START_SEAT_SELECTION_TRANSITION.action,
    expectedFrom: START_SEAT_SELECTION_TRANSITION.from,
    nextTo: START_SEAT_SELECTION_TRANSITION.to,
    businessCodes: START_SEAT_SELECTION_BUSINESS_CODES,
  });
}

export async function runStartSeatSelectionLua(
  redis: Redis,
  input: StartSeatSelectionLuaInput,
): Promise<StartSeatSelectionLuaResult> {
  const commandRedis = getStartSeatSelectionCommandRedis(redis);
  const { prefix, suffix } = buildInBookingSessionFragments(input.sid);
  const rawResult = await commandRedis.startSeatSelectionFromEntering(
    input.sessionKey,
    input.enteringKey,
    input.inBookingSessionsKey,
    input.bookingAmountKey,
    String(input.eventId),
    input.sid,
    prefix,
    suffix,
    START_SEAT_SELECTION_TRANSITION.from,
    START_SEAT_SELECTION_TRANSITION.to,
  );

  return mapStartSeatSelectionLuaResult(rawResult);
}
