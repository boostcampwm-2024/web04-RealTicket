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
  // @ts-expect-error Lua 스크립트 실행 결과 타입의 자동 추론이 불가능하여, 직접 명시하기 위함.
  return redis.eval(updateSeatLua, 1, sectionKey, seatIndex, value);
}
