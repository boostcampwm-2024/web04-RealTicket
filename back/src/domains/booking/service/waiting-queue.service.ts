import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthService } from '../../../auth/service/auth.service';
import { UserService } from '../../user/service/user.service';
import { SSE_MAXIMUM_INTERVAL } from '../const/sseMaximumInterval';
import { WAITING_BROADCAST_INTERVAL } from '../const/waitingBroadcastInterval.const';
import { DEFAULT_WAITING_THROUGHPUT_RATE } from '../const/watingThroughputRate.const';
import { WaitingSseDto } from '../dto/waitingSse.dto';

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
    private userService: UserService,
  ) {
    this.redis = this.redisService.getOrThrow();
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
    const eventId = await this.userService.getUserEventTarget(sid);
    if (!this.queueSubscriptionMap.get(eventId)) {
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
    const subscription = new BehaviorSubject<WaitingSituation>(initialSituation);
    setInterval(
      async () =>
        subscription.next(
          new WaitingSseDto(
            await this.getHeadOrder(eventId),
            await this.getQueueSize(eventId),
            DEFAULT_WAITING_THROUGHPUT_RATE,
          ),
        ),
      Math.min(WAITING_BROADCAST_INTERVAL, SSE_MAXIMUM_INTERVAL),
    );

    this.queueSubscriptionMap.set(eventId, subscription);
    return subscription;
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

  async clearQueue(eventId: number) {
    const subscription = this.queueSubscriptionMap.get(eventId);
    if (subscription) {
      subscription.complete();
      this.queueSubscriptionMap.delete(eventId);
    }
    const keys = await this.redis.keys(`waiting-queue:${eventId}:*`);
    if (keys.length > 0) {
      await this.redis.unlink(...keys);
    }
  }
}
