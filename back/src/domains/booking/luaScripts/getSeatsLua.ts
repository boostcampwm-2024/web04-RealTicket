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

export async function runGetSectionSeatsLua(
  redis: Redis,
  eventId: number,
  sectionIndex: number,
): Promise<number[] | null> {
  // @ts-expect-error Lua 스크립트 실행 결과 타입의 자동 추론이 불가능하여, 직접 명시하기 위함.
  return redis.eval(getSectionSeatsLua, 2, eventId, sectionIndex);
}

/** @deprecated Plan 01-03에서 제거 예정 — booking-seats.service.ts 임시 호환용 */
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
