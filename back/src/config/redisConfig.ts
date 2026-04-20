import { RedisModuleOptions } from '@liaoliaots/nestjs-redis';

const isSentinelMode = process.env.REDIS_SENTINEL_MODE === 'true';

const sharedConnection = isSentinelMode
  ? {
      sentinels: [
        { host: 'redis-sentinel-1', port: 26379 },
        { host: 'redis-sentinel-2', port: 26379 },
        { host: 'redis-sentinel-3', port: 26379 },
      ],
      name: 'mymaster',
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
