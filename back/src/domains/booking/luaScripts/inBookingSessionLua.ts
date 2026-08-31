import Redis from 'ioredis';

export type Seat = [number, number];

export type InBookingSessionLuaCode =
  | 'OK'
  | 'SESSION_NOT_FOUND'
  | 'QUOTA_EXCEEDED'
  | 'CANCEL_EMPTY'
  | 'SEAT_NOT_BOOKED';

export type InBookingSessionLuaResult = { code: InBookingSessionLuaCode };

export type FlushedSeatsLuaResult = { code: InBookingSessionLuaCode; seats: Seat[] };

const IN_BOOKING_SESSION_CODES: readonly InBookingSessionLuaCode[] = [
  'OK',
  'SESSION_NOT_FOUND',
  'QUOTA_EXCEEDED',
  'CANCEL_EMPTY',
  'SEAT_NOT_BOOKED',
];

/** cjson은 빈 테이블을 배열이 아닌 객체(`{}`)로 인코딩하므로 좌석 목록 형태를 되돌린다. */
export const inBookingSessionLuaHelpers = `
  local function readInBookingSession(inBookingSessionsKey, sid)
    local raw = redis.call('HGET', inBookingSessionsKey, sid)
    if not raw then
      return nil
    end
    return cjson.decode(raw)
  end

  local function encodeInBookingSession(session)
    local encoded = cjson.encode(session)
    return (string.gsub(encoded, '"bookedSeats":{}', '"bookedSeats":[]'))
  end

  local function writeInBookingSession(inBookingSessionsKey, sid, session)
    redis.call('HSET', inBookingSessionsKey, sid, encodeInBookingSession(session))
  end

  local function encodeSeatList(seats)
    local parts = {}
    for i = 1, #seats do
      parts[i] = '[' .. seats[i][1] .. ',' .. seats[i][2] .. ']'
    end
    return '[' .. table.concat(parts, ',') .. ']'
  end

  local function findSeatIndex(bookedSeats, sectionIndex, seatIndex)
    for i = 1, #bookedSeats do
      local seat = bookedSeats[i]
      if seat[1] == sectionIndex and seat[2] == seatIndex then
        return i
      end
    end
    return nil
  end
`;

export const addBookedSeatLua = `
  ${inBookingSessionLuaHelpers}

  local inBookingSessionsKey = KEYS[1]

  local sid = ARGV[1]
  local sectionIndex = tonumber(ARGV[2])
  local seatIndex = tonumber(ARGV[3])
  local enforceQuota = ARGV[4] == '1'

  local session = readInBookingSession(inBookingSessionsKey, sid)
  if not session then
    return {'SESSION_NOT_FOUND'}
  end

  if enforceQuota and session.bookingAmount <= #session.bookedSeats then
    return {'QUOTA_EXCEEDED'}
  end

  table.insert(session.bookedSeats, {sectionIndex, seatIndex})
  writeInBookingSession(inBookingSessionsKey, sid, session)

  return {'OK'}
`;

export const removeBookedSeatLua = `
  ${inBookingSessionLuaHelpers}

  local inBookingSessionsKey = KEYS[1]

  local sid = ARGV[1]
  local sectionIndex = tonumber(ARGV[2])
  local seatIndex = tonumber(ARGV[3])
  local requireBooked = ARGV[4] == '1'

  local session = readInBookingSession(inBookingSessionsKey, sid)
  if not session then
    if requireBooked then
      return {'CANCEL_EMPTY'}
    end
    return {'SESSION_NOT_FOUND'}
  end

  if requireBooked and #session.bookedSeats == 0 then
    return {'CANCEL_EMPTY'}
  end

  local foundIndex = findSeatIndex(session.bookedSeats, sectionIndex, seatIndex)
  if not foundIndex then
    if requireBooked then
      return {'SEAT_NOT_BOOKED'}
    end
    return {'OK'}
  end

  table.remove(session.bookedSeats, foundIndex)
  writeInBookingSession(inBookingSessionsKey, sid, session)

  return {'OK'}
`;

export const flushBookedSeatsLua = `
  ${inBookingSessionLuaHelpers}

  local inBookingSessionsKey = KEYS[1]

  local sid = ARGV[1]
  local setBookingAmount = ARGV[2] == '1'
  local bookingAmount = tonumber(ARGV[3])
  local onlyWhenUnsaved = ARGV[4] == '1'

  local session = readInBookingSession(inBookingSessionsKey, sid)
  if not session then
    return {'SESSION_NOT_FOUND', '[]'}
  end

  if onlyWhenUnsaved and session.saved then
    return {'OK', '[]'}
  end

  local flushedSeats = encodeSeatList(session.bookedSeats)
  session.bookedSeats = {}

  if setBookingAmount then
    session.bookingAmount = bookingAmount
  end

  writeInBookingSession(inBookingSessionsKey, sid, session)

  return {'OK', flushedSeats}
`;

export const setInBookingSavedLua = `
  ${inBookingSessionLuaHelpers}

  local inBookingSessionsKey = KEYS[1]

  local sid = ARGV[1]
  local saved = ARGV[2] == '1'

  local session = readInBookingSession(inBookingSessionsKey, sid)
  if not session then
    return {'SESSION_NOT_FOUND'}
  end

  session.saved = saved
  writeInBookingSession(inBookingSessionsKey, sid, session)

  return {'OK'}
`;

export const setSubscribedSectionLua = `
  ${inBookingSessionLuaHelpers}

  local inBookingSessionsKey = KEYS[1]

  local sid = ARGV[1]
  local hasSection = ARGV[2] == '1'
  local sectionIndex = tonumber(ARGV[3])

  local session = readInBookingSession(inBookingSessionsKey, sid)
  if not session then
    return {'SESSION_NOT_FOUND'}
  end

  if hasSection then
    session.subscribedSection = sectionIndex
  else
    session.subscribedSection = cjson.null
  end

  writeInBookingSession(inBookingSessionsKey, sid, session)

  return {'OK'}
`;

type InBookingSessionRawResult = [InBookingSessionLuaCode, ...unknown[]] | InBookingSessionLuaCode;

type RedisWithInBookingSessionCommands = Redis & {
  addInBookingBookedSeat(
    inBookingSessionsKey: string,
    sid: string,
    sectionIndex: string,
    seatIndex: string,
    enforceQuota: string,
  ): Promise<InBookingSessionRawResult>;

  removeInBookingBookedSeat(
    inBookingSessionsKey: string,
    sid: string,
    sectionIndex: string,
    seatIndex: string,
    requireBooked: string,
  ): Promise<InBookingSessionRawResult>;

  flushInBookingBookedSeats(
    inBookingSessionsKey: string,
    sid: string,
    setBookingAmount: string,
    bookingAmount: string,
    onlyWhenUnsaved: string,
  ): Promise<InBookingSessionRawResult>;

  setInBookingSaved(
    inBookingSessionsKey: string,
    sid: string,
    saved: string,
  ): Promise<InBookingSessionRawResult>;

  setInBookingSubscribedSection(
    inBookingSessionsKey: string,
    sid: string,
    hasSection: string,
    sectionIndex: string,
  ): Promise<InBookingSessionRawResult>;
};

const commandRegisteredRedisSet = new WeakSet<object>();

function getInBookingSessionCommandRedis(redis: Redis): RedisWithInBookingSessionCommands {
  if (!commandRegisteredRedisSet.has(redis)) {
    redis.defineCommand('addInBookingBookedSeat', { numberOfKeys: 1, lua: addBookedSeatLua });
    redis.defineCommand('removeInBookingBookedSeat', { numberOfKeys: 1, lua: removeBookedSeatLua });
    redis.defineCommand('flushInBookingBookedSeats', { numberOfKeys: 1, lua: flushBookedSeatsLua });
    redis.defineCommand('setInBookingSaved', { numberOfKeys: 1, lua: setInBookingSavedLua });
    redis.defineCommand('setInBookingSubscribedSection', {
      numberOfKeys: 1,
      lua: setSubscribedSectionLua,
    });
    commandRegisteredRedisSet.add(redis);
  }

  return redis as RedisWithInBookingSessionCommands;
}

function parseCode(raw: InBookingSessionRawResult): InBookingSessionLuaCode {
  const code = Array.isArray(raw) ? raw[0] : raw;

  if (!IN_BOOKING_SESSION_CODES.includes(code)) {
    throw new TypeError(`Unknown in-booking session Lua code: ${String(code)}`);
  }

  return code;
}

export function mapInBookingSessionLuaResult(raw: InBookingSessionRawResult): InBookingSessionLuaResult {
  return { code: parseCode(raw) };
}

export function mapFlushedSeatsLuaResult(raw: InBookingSessionRawResult): FlushedSeatsLuaResult {
  const code = parseCode(raw);
  const encodedSeats = Array.isArray(raw) ? raw[1] : undefined;

  if (typeof encodedSeats !== 'string') {
    throw new TypeError('좌석 회수 Lua는 좌석 목록 JSON을 함께 반환해야 함');
  }

  return { code, seats: JSON.parse(encodedSeats) as Seat[] };
}

export async function runAddBookedSeatLua(
  redis: Redis,
  input: { inBookingSessionsKey: string; sid: string; seat: Seat; enforceQuota: boolean },
): Promise<InBookingSessionLuaResult> {
  const commandRedis = getInBookingSessionCommandRedis(redis);
  const rawResult = await commandRedis.addInBookingBookedSeat(
    input.inBookingSessionsKey,
    input.sid,
    String(input.seat[0]),
    String(input.seat[1]),
    input.enforceQuota ? '1' : '0',
  );

  return mapInBookingSessionLuaResult(rawResult);
}

export async function runRemoveBookedSeatLua(
  redis: Redis,
  input: { inBookingSessionsKey: string; sid: string; seat: Seat; requireBooked: boolean },
): Promise<InBookingSessionLuaResult> {
  const commandRedis = getInBookingSessionCommandRedis(redis);
  const rawResult = await commandRedis.removeInBookingBookedSeat(
    input.inBookingSessionsKey,
    input.sid,
    String(input.seat[0]),
    String(input.seat[1]),
    input.requireBooked ? '1' : '0',
  );

  return mapInBookingSessionLuaResult(rawResult);
}

export async function runFlushBookedSeatsLua(
  redis: Redis,
  input: {
    inBookingSessionsKey: string;
    sid: string;
    bookingAmount?: number;
    onlyWhenUnsaved?: boolean;
  },
): Promise<FlushedSeatsLuaResult> {
  const commandRedis = getInBookingSessionCommandRedis(redis);
  const setBookingAmount = input.bookingAmount !== undefined;
  const rawResult = await commandRedis.flushInBookingBookedSeats(
    input.inBookingSessionsKey,
    input.sid,
    setBookingAmount ? '1' : '0',
    String(input.bookingAmount ?? 0),
    input.onlyWhenUnsaved ? '1' : '0',
  );

  return mapFlushedSeatsLuaResult(rawResult);
}

export async function runSetInBookingSavedLua(
  redis: Redis,
  input: { inBookingSessionsKey: string; sid: string; saved: boolean },
): Promise<InBookingSessionLuaResult> {
  const commandRedis = getInBookingSessionCommandRedis(redis);
  const rawResult = await commandRedis.setInBookingSaved(
    input.inBookingSessionsKey,
    input.sid,
    input.saved ? '1' : '0',
  );

  return mapInBookingSessionLuaResult(rawResult);
}

export async function runSetSubscribedSectionLua(
  redis: Redis,
  input: { inBookingSessionsKey: string; sid: string; sectionIndex: number | null },
): Promise<InBookingSessionLuaResult> {
  const commandRedis = getInBookingSessionCommandRedis(redis);
  const rawResult = await commandRedis.setInBookingSubscribedSection(
    input.inBookingSessionsKey,
    input.sid,
    input.sectionIndex === null ? '0' : '1',
    String(input.sectionIndex ?? 0),
  );

  return mapInBookingSessionLuaResult(rawResult);
}
