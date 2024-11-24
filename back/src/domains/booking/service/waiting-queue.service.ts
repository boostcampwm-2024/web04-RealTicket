import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthService } from '../../../auth/service/auth.service';
import { WAITING_BROADCAST_INTERVAL } from '../const/waitingBroadcastInterval.const';
import { DEFAULT_WAITING_THROUGHPUT_RATE } from '../const/watingThroughputRate.const';

type WaitingSituation = {
  headOrder: number;
  totalWaiting: number;
  throughputRate: number;
};

@Injectable()
export class WaitingQueueService {
  private readonly redis: Redis | null;
  private queueSubscriptionMap = new Map<number, BehaviorSubject<WaitingSituation>>();

  constructor(
    private redisService: RedisService,
    private authService: AuthService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  @OnEvent('seats-sse-close')
  async letInNextWaiting(event: { sid: string }) {
    const eventId = await this.authService.getUserEventTarget(event.sid);
    const { sid } = await this.popQueue(eventId);
    await this.authService.setUserStatusSelectingSeat(sid);
  }

  subscribeQueue(eventId: number) {
    return this.queueSubscriptionMap
      .get(eventId)
      .asObservable()
      .pipe(
        map((data) => {
          return { data };
        }),
      );
  }

  async pushQueue(sid: string) {
    const eventId = await this.authService.getUserEventTarget(sid);
    if (!this.queueSubscriptionMap.get(eventId)) {
      await this.createQueueSubscription(eventId);
    }
    const order = await this.redis.incr(`waiting-queue:${eventId}:order`);
    const item = JSON.stringify({ sid, order });
    await this.redis.rpush(`waiting-queue:${eventId}`, item);
    return order;
  }

  async popQueue(eventId: number) {
    const { sid, order } = JSON.parse(await this.redis.lpop(`waiting-queue:${eventId}`));
    return { sid, order };
  }

  private async createQueueSubscription(eventId: number) {
    const initialSituation = {
      headOrder: 0,
      totalWaiting: 0,
      throughputRate: DEFAULT_WAITING_THROUGHPUT_RATE,
    };
    const subscription = new BehaviorSubject<WaitingSituation>(initialSituation);
    setInterval(
      async () =>
        subscription.next({
          headOrder: await this.getHeadOrder(eventId),
          totalWaiting: await this.getQueueSize(eventId),
          throughputRate: DEFAULT_WAITING_THROUGHPUT_RATE,
        }),
      WAITING_BROADCAST_INTERVAL,
    );

    this.queueSubscriptionMap.set(eventId, subscription);
    return subscription;
  }

  private async getHeadOrder(eventId: number) {
    const headItem = await this.redis.lindex(`waiting-queue:${eventId}`, 0);
    const headOrder = headItem ? JSON.parse(headItem).order : null;
    return headOrder;
  }

  private async getQueueSize(eventId: number) {
    const size = await this.redis.llen(`waiting-queue:${eventId}`);
    return size;
  }
}
