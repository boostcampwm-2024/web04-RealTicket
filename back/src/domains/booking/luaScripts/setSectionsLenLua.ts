import Redis from 'ioredis';

const setSectionsLenLua = `
  local eventId = KEYS[1]
  local sectionsLen = KEYS[2]
  
  redis.call('SET', 'event:'..eventId..':sections:len', sectionsLen)
  
  return 'OK'
  `;

type RedisWithSetSectionsLenCommand = Redis & {
  setSectionsLen(eventId: string, sectionsLen: string): Promise<number>;
};

const commandRegisteredRedisSet = new WeakSet<object>();

function getSetSectionsLenCommandRedis(redis: Redis): RedisWithSetSectionsLenCommand {
  if (!commandRegisteredRedisSet.has(redis)) {
    redis.defineCommand('setSectionsLen', { numberOfKeys: 2, lua: setSectionsLenLua });
    commandRegisteredRedisSet.add(redis);
  }

  return redis as RedisWithSetSectionsLenCommand;
}

export async function runSetSectionsLenLua(
  redis: Redis,
  eventId: number,
  sectionsLen: number,
): Promise<number> {
  const commandRedis = getSetSectionsLenCommandRedis(redis);
  return commandRedis.setSectionsLen(String(eventId), sectionsLen.toString());
}
