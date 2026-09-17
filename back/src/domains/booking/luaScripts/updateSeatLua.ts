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

type RedisWithUpdateSeatCommand = Redis & {
  updateSeat(sectionKey: string, seatIndex: string, value: string): Promise<number | 'nil'>;
};

const commandRegisteredRedisSet = new WeakSet<object>();

function getUpdateSeatCommandRedis(redis: Redis): RedisWithUpdateSeatCommand {
  if (!commandRegisteredRedisSet.has(redis)) {
    redis.defineCommand('updateSeat', { numberOfKeys: 1, lua: updateSeatLua });
    commandRegisteredRedisSet.add(redis);
  }

  return redis as RedisWithUpdateSeatCommand;
}

export async function runUpdateSeatLua(
  redis: Redis,
  sectionKey: string,
  seatIndex: number,
  value: 0 | 1,
): Promise<number | 'nil'> {
  const commandRedis = getUpdateSeatCommandRedis(redis);
  return commandRedis.updateSeat(sectionKey, String(seatIndex), String(value));
}
