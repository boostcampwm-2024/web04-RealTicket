import { RedisModuleOptions } from '@liaoliaots/nestjs-redis';

const isSentinelMode = process.env.REDIS_SENTINEL_MODE === 'true';

function parseSentinels(hostsEnv: string): { host: string; port: number }[] {
  return hostsEnv.split(',').map((entry) => {
    const [host, portStr] = entry.trim().split(':');
    return { host, port: parseInt(portStr || '26379', 10) };
  });
}

const sharedConnection = isSentinelMode
  ? {
      sentinels: parseSentinels(process.env.REDIS_SENTINEL_HOSTS),
      name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
      password: process.env.REDIS_PASSWORD || undefined,
    }
  : {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    };

const redisConfig: RedisModuleOptions = {
  readyLog: true,
  config: [{ ...sharedConnection }, { ...sharedConnection, namespace: 'pubsub' }],
};

export default redisConfig;
