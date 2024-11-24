import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { AuthService } from '../../../auth/service/auth.service';

@Injectable()
export class WaitingQueueService {
  private readonly redis: Redis | null;

  constructor(
    private redisService: RedisService,
    private authService: AuthService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async pushWaitingQueue(sid: string) {
    const eventId = await this.authService.getUserEventTarget(sid);
    const order = await this.redis.incr(`waiting-queue:${eventId}:order`);
    const item = JSON.stringify({ sid, order });
    await this.redis.rpush(`waiting-queue:${eventId}`, item);
    return order;
  }

  async popWaitingQueue(eventId: number) {
    const { sid, order } = JSON.parse(await this.redis.lpop(`waiting-queue:${eventId}`));
    return { sid, order };
  }

  async getHeadOrder(eventId: number) {
    const headItem = await this.redis.lindex(`waiting-queue:${eventId}`, 0);
    const headOrder = headItem ? JSON.parse(headItem).order : null;
    return headOrder;
  }

  private async getWaitingQueueSize(eventId: number) {
    const size = await this.redis.llen(`waiting-queue:${eventId}`);
    return size;
  }

  private async getOrder(eventId: number) {
    const order = await this.redis.get(`waiting-queue:${eventId}:order`);
    return order ? parseInt(order) : null;
  }
}
