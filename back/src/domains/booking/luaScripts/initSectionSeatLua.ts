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
  // @ts-expect-error eval 반환 타입을 Lua 계약에 맞춘다.
  return redis.eval(initSectionSeatLua, 1, key, seatBitMap);
}
