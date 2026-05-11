import { RedisService } from '@liaoliaots/nestjs-redis';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Response } from 'express';
import Redis from 'ioredis';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';

import { USER_STATUS } from '../../../auth/const/userStatus.const';
import { AuthService } from '../../../auth/service/auth.service';
import { SSE_MAXIMUM_INTERVAL } from '../const/sseMaximumInterval';
import { WAITING_BROADCAST_INTERVAL } from '../const/waitingBroadcastInterval.const';
import { DEFAULT_WAITING_THROUGHPUT_RATE } from '../const/watingThroughputRate.const';
import { WaitingSseDto } from '../dto/waitingSse.dto';

type WaitingSituation = {
  userOrder: number;
  totalWaiting: number;
  restMilisecond: number;
  enteringStatus: boolean;
};

type WaitingClientSubscription = {
  res: Response;
  sid: string;
  messageId: number;
  interval?: NodeJS.Timeout;
};

@Injectable()
export class WaitingQueueService implements OnModuleDestroy {
  private readonly redis: Redis | null;
  private waitingClientMap = new Map<number, Set<WaitingClientSubscription>>();
  private knownEventIds = new Set<number>();

  constructor(
    private redisService: RedisService,
    private readonly authService: AuthService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async addSseClient(eventId: number, res: Response, sid: string): Promise<void> {
    this.knownEventIds.add(eventId);
    this.initializeSseResponse(res);

    const client: WaitingClientSubscription = { res, sid, messageId: 0 };
    if (!this.waitingClientMap.has(eventId)) {
      this.waitingClientMap.set(eventId, new Set());
    }
    this.waitingClientMap.get(eventId).add(client);

    const sent = await this.sendPersonalWaitingSituation(eventId, client);
    if (!sent || !this.hasSseClient(eventId, client)) {
      return;
    }

    client.interval = setInterval(
      () => void this.sendPersonalWaitingSituation(eventId, client),
      Math.min(WAITING_BROADCAST_INTERVAL, SSE_MAXIMUM_INTERVAL),
    );
  }

  removeSseClient(eventId: number, res: Response): void {
    const clients = this.waitingClientMap.get(eventId);
    if (!clients) return;

    for (const client of clients) {
      if (client.res === res) {
        if (client.interval) {
          clearInterval(client.interval);
        }
        clients.delete(client);
        break;
      }
    }

    if (clients.size === 0) {
      this.waitingClientMap.delete(eventId);
    }
  }

  async pushQueue(eventId: number, sid: string) {
    this.knownEventIds.add(eventId);
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

  private initializeSseResponse(res: Response): void {
    if (!res.headersSent) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
        Pragma: 'no-cache',
        Expire: '0',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();
    }

    const socket = res.socket;
    if (socket) {
      socket.setKeepAlive(true);
      socket.setNoDelay(true);
      socket.setTimeout(0);
    }

    res.write('\n');
  }

  private async sendPersonalWaitingSituation(
    eventId: number,
    client: WaitingClientSubscription,
  ): Promise<boolean> {
    try {
      if (client.res.destroyed || client.res.writableEnded) {
        this.removeSseClient(eventId, client.res);
        return false;
      }

      const data = await this.getPersonalWaitingSituation(eventId, client.sid);
      const sseMessage = this.formatSseMessage(client, data);
      client.res.write(sseMessage);
      return true;
    } catch (err) {
      this.logger.warn(
        `[waiting] personal SSE send failed: eventId=${eventId}, sid=${client.sid}, error=${
          err instanceof Error ? err.message : 'unknown'
        }`,
      );
      this.removeSseClient(eventId, client.res);
      try {
        client.res.end();
      } catch {}
      return false;
    }
  }

  private hasSseClient(eventId: number, client: WaitingClientSubscription): boolean {
    return this.waitingClientMap.get(eventId)?.has(client) ?? false;
  }

  private formatSseMessage(client: WaitingClientSubscription, data: WaitingSituation): string {
    client.messageId += 1;
    return `id: ${client.messageId}\ndata: ${JSON.stringify(data)}\n\n`;
  }

  private async getPersonalWaitingSituation(eventId: number, sid: string): Promise<WaitingSituation> {
    const items = await this.redis.lrange(`waiting-queue:${eventId}`, 0, -1);
    const totalWaiting = items.length;
    const userOrder = this.getUserOrderFromItems(items, sid);

    if (userOrder !== null) {
      return new WaitingSseDto(userOrder, totalWaiting, userOrder * DEFAULT_WAITING_THROUGHPUT_RATE, false);
    }

    return new WaitingSseDto(0, totalWaiting, 0, await this.isEnteringOrBeyond(sid));
  }

  private getUserOrderFromItems(items: string[], sid: string): number | null {
    for (let index = 0; index < items.length; index += 1) {
      try {
        const parsed = JSON.parse(items[index]);
        if (parsed?.sid === sid) {
          return index + 1;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  private async isEnteringOrBeyond(sid: string): Promise<boolean> {
    const session = await this.authService.getUserSession(sid);
    return (
      session?.userStatus === USER_STATUS.ENTERING ||
      session?.userStatus === USER_STATUS.SELECTING_SEAT ||
      session?.userStatus === USER_STATUS.RECONNECTING_SELECTING
    );
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
    const eventIds = [...this.knownEventIds];
    await Promise.allSettled(eventIds.map((id) => this.clearQueue(id)));
  }

  async clearQueue(eventId: number) {
    const clients = this.waitingClientMap.get(eventId);
    if (clients) {
      for (const client of clients) {
        if (client.interval) {
          clearInterval(client.interval);
        }
        try {
          client.res.end();
        } catch {}
      }
      this.waitingClientMap.delete(eventId);
    }
    this.knownEventIds.delete(eventId);

    const keys = [`waiting-queue:${eventId}`, ...(await this.redis.keys(`waiting-queue:${eventId}:*`))];
    if (keys.length > 0) {
      await this.redis.unlink(...keys);
    }
  }
}
