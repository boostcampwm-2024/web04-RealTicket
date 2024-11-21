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
  // @ts-expect-error Lua 스크립트 실행 결과 타입의 자동 추론이 불가능하여, 직접 명시하기 위함.
  return redis.eval(setSectionsLenLua, 2, eventId, sectionsLen.toString());
}
