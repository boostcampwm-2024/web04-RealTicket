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

type RedisWithInitSectionSeatCommand = Redis & {
  initSectionSeat(key: string, seatBitMap: string): Promise<number>;
};

const commandRegisteredRedisSet = new WeakSet<object>();

function getInitSectionSeatCommandRedis(redis: Redis): RedisWithInitSectionSeatCommand {
  if (!commandRegisteredRedisSet.has(redis)) {
    redis.defineCommand('initSectionSeat', { numberOfKeys: 1, lua: initSectionSeatLua });
    commandRegisteredRedisSet.add(redis);
  }

  return redis as RedisWithInitSectionSeatCommand;
}

export async function runInitSectionSeatLua(redis: Redis, key: string, seatBitMap: string): Promise<number> {
  const commandRedis = getInitSectionSeatCommandRedis(redis);
  return commandRedis.initSectionSeat(key, seatBitMap);
}
