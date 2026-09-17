import Redis from 'ioredis';

const getSectionSeatsLua = `
  local eventId = KEYS[1]
  local sectionIndex = KEYS[2]
  local sectionKey = 'event:'..eventId..':section:'..sectionIndex..':seats'
  local seatsLen = tonumber(redis.call('GET', sectionKey..':len'))
  if not seatsLen then return nil end

  local bitMasks = {128, 64, 32, 16, 8, 4, 2, 1}
  local byteLen = math.ceil(seatsLen / 8)
  local rawBytes = redis.call('GETRANGE', sectionKey, 0, byteLen - 1)

  local sectionResult = {}
  local resultIndex = 1

  for byteIndex = 1, byteLen do
    local byte = string.byte(rawBytes, byteIndex) or 0
    for bitPos = 1, 8 do
      if resultIndex > seatsLen then break end
      sectionResult[resultIndex] = math.floor(byte / bitMasks[bitPos]) % 2
      resultIndex = resultIndex + 1
    end
    if resultIndex > seatsLen then break end
  end

  return sectionResult
`;

type RedisWithGetSectionSeatsCommand = Redis & {
  getSectionSeats(eventId: string, sectionIndex: string): Promise<number[] | null>;
};

const commandRegisteredRedisSet = new WeakSet<object>();

function getSectionSeatsCommandRedis(redis: Redis): RedisWithGetSectionSeatsCommand {
  if (!commandRegisteredRedisSet.has(redis)) {
    redis.defineCommand('getSectionSeats', { numberOfKeys: 2, lua: getSectionSeatsLua });
    commandRegisteredRedisSet.add(redis);
  }

  return redis as RedisWithGetSectionSeatsCommand;
}

export async function runGetSectionSeatsLua(
  redis: Redis,
  eventId: number,
  sectionIndex: number,
): Promise<number[] | null> {
  const commandRedis = getSectionSeatsCommandRedis(redis);
  return commandRedis.getSectionSeats(String(eventId), String(sectionIndex));
}

/** @deprecated 섹션별 조회에는 runGetSectionSeatsLua를 사용한다. */
export async function runGetSeatsLua(redis: Redis, eventId: number): Promise<number[][] | null> {
  const sectionsLenRaw = await redis.get(`event:${eventId}:sections:len`);
  if (!sectionsLenRaw) return null;
  const sectionsLen = parseInt(sectionsLenRaw, 10);
  const results: number[][] = [];
  for (let i = 0; i < sectionsLen; i++) {
    const section = await runGetSectionSeatsLua(redis, eventId, i);
    if (!section) return null;
    results.push(section);
  }
  return results;
}
