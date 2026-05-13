import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

@Injectable()
export class TestRedisService {
  private redisClient: Redis;
  private pubsubClient: Redis;

  constructor() {
    this.redisClient = new RedisMock() as unknown as Redis;
    this.pubsubClient = new RedisMock() as unknown as Redis;
  }

  getOrThrow(namespace?: string): Redis {
    if (namespace === 'pubsub') return this.pubsubClient;
    return this.redisClient;
  }

  async flushAll(): Promise<void> {
    await this.redisClient.flushall();
  }

  async disconnect(): Promise<void> {
    this.redisClient.disconnect();
    this.pubsubClient.disconnect();
  }
}
