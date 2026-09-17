import Redis from 'ioredis';

const setSectionsLenLua = `
  local eventId = KEYS[1]
  local sectionsLen = KEYS[2]
  
  redis.call('SET', 'event:'..eventId..':sections:len', sectionsLen)
  
  return 'OK'
  `;

export async function runSetSectionsLenLua(
  redis: Redis,
  eventId: number,
  sectionsLen: number,
): Promise<number> {
  // @ts-expect-error eval 반환 타입을 Lua 계약에 맞춘다.
  return redis.eval(setSectionsLenLua, 2, eventId, sectionsLen.toString());
}
