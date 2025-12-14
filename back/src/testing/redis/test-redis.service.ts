import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

@Injectable()
export class TestRedisService {
  private redisClient: Redis;

  constructor() {
    this.redisClient = new RedisMock() as unknown as Redis;
  }

  getOrThrow(): Redis {
    return this.redisClient;
  }

  async flushAll(): Promise<void> {
    await this.redisClient.flushall();
  }

  async disconnect(): Promise<void> {
    this.redisClient.disconnect();
  }
}
