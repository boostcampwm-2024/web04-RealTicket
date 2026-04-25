import { RedisService } from '@liaoliaots/nestjs-redis';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Response } from 'express';
import Redis from 'ioredis';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { BehaviorSubject } from 'rxjs';
import { Logger as WinstonLogger } from 'winston';

import { SSE_MAXIMUM_INTERVAL } from '../const/sseMaximumInterval';
import { WAITING_BROADCAST_INTERVAL } from '../const/waitingBroadcastInterval.const';
import { DEFAULT_WAITING_THROUGHPUT_RATE } from '../const/watingThroughputRate.const';
import { WaitingSseDto } from '../dto/waitingSse.dto';
import { SseBroadcaster } from '../sse/sse-broadcaster';

type WaitingSituation = {
  headOrder: number;
  totalWaiting: number;
  throughputRate: number;
};

type QueueSubscription = {
  subject: BehaviorSubject<WaitingSituation>;
  interval: NodeJS.Timeout;
};

@Injectable()
export class WaitingQueueService implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private queueSubscriptionMap = new Map<number, QueueSubscription>();
  private readonly sseBroadcaster: SseBroadcaster<WaitingSituation>;

  constructor(
    private redisService: RedisService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {
    this.redis = this.redisService.getOrThrow();
    this.sseBroadcaster = new SseBroadcaster('waiting', this.logger);
  }

  async addSseClient(eventId: number, res: Response, sid: string): Promise<void> {
    if (!this.queueSubscriptionMap.has(eventId)) {
      await this.createQueueSubscription(eventId);
    }
    this.sseBroadcaster.addClient(String(eventId), res, sid);
  }

  removeSseClient(eventId: number, res: Response): void {
    this.sseBroadcaster.removeClient(String(eventId), res);
  }

  async pushQueue(eventId: number, sid: string) {
    if (!this.queueSubscriptionMap.has(eventId)) {
      await this.createQueueSubscription(eventId);
    }
    const order = await this.redis.incr(`waiting-queue:${eventId}:order`);
    const item = JSON.stringify({ sid, order });
    await this.redis.rpush(`waiting-queue:${eventId}`, item);
    return order;
  }

  async popQueue(eventId: number) {
    const item = await this.redis.lpop(`waiting-queue:${eventId}`);
    if (!item) {
      return null;
    }
    return JSON.parse(item);
  }

  async getQueueSize(eventId: number) {
    const size = await this.redis.llen(`waiting-queue:${eventId}`);
    return size;
  }

  private async createQueueSubscription(eventId: number) {
    const initialSituation = {
      headOrder: 0,
      totalWaiting: 0,
      throughputRate: DEFAULT_WAITING_THROUGHPUT_RATE,
    };
    const subject = new BehaviorSubject<WaitingSituation>(initialSituation);
    const interval = setInterval(
      async () =>
        subject.next(
          new WaitingSseDto(
            await this.getHeadOrder(eventId),
            await this.getQueueSize(eventId),
            DEFAULT_WAITING_THROUGHPUT_RATE,
          ),
        ),
      Math.min(WAITING_BROADCAST_INTERVAL, SSE_MAXIMUM_INTERVAL),
    );

    this.queueSubscriptionMap.set(eventId, { subject, interval });
    this.sseBroadcaster.startBroadcast(String(eventId), subject.asObservable());
    return subject;
  }

  private async getHeadOrder(eventId: number) {
    const headItem = await this.redis.lindex(`waiting-queue:${eventId}`, 0);
    const headOrder = headItem ? JSON.parse(headItem).order : null;
    if (!headOrder) {
      const recentHeadOrder = parseInt(await this.redis.get(`waiting-queue:${eventId}:order`));
      return recentHeadOrder + 1;
    }
    return headOrder;
  }

  async getAllWaitingSids(eventId: number) {
    return (await this.redis.lrange(`waiting-queue:${eventId}`, 0, -1))
      .map((item) => {
        try {
          const parsed = JSON.parse(item);
          return parsed?.sid;
        } catch (e) {
          return e ? null : null;
        }
      })
      .filter((sid) => sid != null);
  }

  async onModuleDestroy() {
    const eventIds = [...this.queueSubscriptionMap.keys()];
    await Promise.allSettled(eventIds.map((id) => this.clearQueue(id)));
  }

  async clearQueue(eventId: number) {
    this.sseBroadcaster.stopBroadcast(String(eventId));
    const queueSubscription = this.queueSubscriptionMap.get(eventId);
    if (queueSubscription) {
      clearInterval(queueSubscription.interval);
      queueSubscription.subject.complete();
      this.queueSubscriptionMap.delete(eventId);
    }
    const keys = await this.redis.keys(`waiting-queue:${eventId}:*`);
    if (keys.length > 0) {
      await this.redis.unlink(...keys);
    }
  }
}
