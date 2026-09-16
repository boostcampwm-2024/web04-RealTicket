import Redis from 'ioredis';

const updateSeatLua = `
    local key = KEYS[1]
    local lenKey = KEYS[1] .. ':len'
    local index = tonumber(ARGV[1])
    local value = tonumber(ARGV[2])
    
    local maxLength = redis.call('GET', lenKey)
    if index < 0 or index >= tonumber(maxLength) then
      return nil
    end
    
    local currentValue = redis.call('GETBIT', key, index)
    if currentValue ~= value then
      redis.call('SETBIT', key, index, value)
      return 1
    end
    return 0
  `;

export async function runUpdateSeatLua(
  redis: Redis,
  sectionKey: string,
  seatIndex: number,
  value: 0 | 1,
): Promise<number | 'nil'> {
  // @ts-expect-error eval 반환 타입을 Lua 계약에 맞춘다.
  return redis.eval(updateSeatLua, 1, sectionKey, seatIndex, value);
}
