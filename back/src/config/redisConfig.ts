import { RedisModuleOptions } from '@liaoliaots/nestjs-redis';
// 지워야됨
import './setEnviorment';

const redisConfig: RedisModuleOptions = {
  readyLog: true,
  config: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_PASSWORD,
  },
};

export default redisConfig;
