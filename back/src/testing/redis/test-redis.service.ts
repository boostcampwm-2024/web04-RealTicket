import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import RedisMock from 'ioredis-mock';

import { installAdmissionCapacityCommandMock } from './admission-capacity-command-mock';
import { installReconnectingTransitionCommandMock } from './reconnecting-transition-command-mock';
import { installUserStateTransitionCommandMock } from './user-state-transition-command-mock';
import { installWaitingQueueEntryCommandMock } from './waiting-queue-entry-command-mock';

@Injectable()
export class TestRedisService {
  private redisClient: Redis;
  private pubsubClient: Redis;

  constructor() {
    this.redisClient = new RedisMock() as unknown as Redis;
    this.pubsubClient = new RedisMock() as unknown as Redis;
    installAdmissionCapacityCommandMock(this.redisClient);
    installReconnectingTransitionCommandMock(this.redisClient);
    installUserStateTransitionCommandMock(this.redisClient);
    installWaitingQueueEntryCommandMock(this.redisClient);
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
