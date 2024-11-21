import Redis from 'ioredis';

const initSectionSeatLua = `
  local key = KEYS[1]
  local lenKey = KEYS[1] .. ':len'
  local bitString = ARGV[1]
  local totalBits = string.len(bitString)
  
  redis.call('DEL', key)
  
  for i = 1, totalBits do
     local bit = string.sub(bitString, i, i)
     redis.call('SETBIT', key, i-1, bit)
  end
  
  redis.call('SET', lenKey, totalBits)
  
  return 1
  `;

export async function runInitSectionSeatLua(redis: Redis, key: string, seatBitMap: string): Promise<number> {
  // @ts-expect-error Lua 스크립트 실행 결과 타입의 자동 추론이 불가능하여, 직접 명시하기 위함.
  return redis.eval(initSectionSeatLua, 1, key, seatBitMap);
}
