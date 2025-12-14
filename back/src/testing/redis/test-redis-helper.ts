import { TestRedisService } from './test-redis.service';

export async function flushTestRedis(redisService: TestRedisService): Promise<void> {
  await redisService.flushAll();
}

export function createBeforeEachRedisFlush(getRedisService: () => TestRedisService) {
  return async () => {
    const redis = getRedisService();
    await redis.flushAll();
  };
}

export function createAfterEachRedisFlush(getRedisService: () => TestRedisService) {
  return async () => {
    const redis = getRedisService();
    await redis.flushAll();
  };
}
