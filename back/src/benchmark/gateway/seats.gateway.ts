import { parse } from 'url';

import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { parse as parseCookie } from 'cookie';
import Redis from 'ioredis';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Subscription } from 'rxjs';
import { Logger as WinstonLogger } from 'winston';
import { Server } from 'ws';
import * as WebSocket from 'ws';

import { AUTH_EXPIRE_TIME } from '../../auth/const/authExpireTime.const';
import { USER_STATUS } from '../../auth/const/userStatus.const';
import { canAccessSessionRequirements } from '../../auth/guard/session-auth-requirement.policy';
import { BookingSeatsService } from '../../domains/booking/service/booking-seats.service';
import { BookingService } from '../../domains/booking/service/booking.service';

interface CustomWebSocket extends WebSocket {
  sid?: string;
  eventId?: number;
}

type SeatStatusObject = {
  seatStatus: number[][] | number[];
};

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  path: '/benchmark/seat',
})
@Injectable()
export class SeatsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  readonly redis: Redis;
  private clients = new Set<CustomWebSocket>();
  private eventClients = new Map<number, Set<CustomWebSocket>>();
  private eventSubscriptions = new Map<number, Subscription>();
  private eventConnectionCounts = new Map<number, number>();
  private latestSeatsData = new Map<number, SeatStatusObject>();

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: WinstonLogger,
    private readonly bookingService: BookingService,
    private readonly bookingSeatsService: BookingSeatsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly redisService: RedisService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  async authorize(sid, eventId) {
    if (!sid) return false;

    const sessionData = await this.redis.get(`user:${sid}`);
    if (!sessionData) {
      return false;
    }

    let session: any;
    try {
      session = JSON.parse(sessionData);
    } catch {
      return false;
    }
    if (!session) {
      return false;
    }

    if (session.targetEvent !== eventId) {
      return false;
    }

    if (canAccessSessionRequirements(session, [USER_STATUS.ENTERING, USER_STATUS.SELECTING_SEAT])) {
      await this.redis.expireat(`user:${sid}`, Math.round(Date.now() / 1000) + AUTH_EXPIRE_TIME);
      return true;
    }

    return false;
  }

  async handleConnection(client: CustomWebSocket, req: Request): Promise<void> {
    this.clients.add(client);

    const { eventId, sid } = this.parseConnectionParams(req);

    if (!this.validateEventId(eventId, client, req)) {
      return;
    }
    if (!(await this.authorize(sid, eventId))) {
      client.close(1008, '올바른 접근이 아닙니다.');
      return;
    }

    client.sid = sid;
    client.eventId = eventId;

    try {
      await this.bookingService.setInBookingFromEntering(sid);
    } catch (error) {
      client.close(1008, '올바른 접근이 아닙니다.');
      this.logger.error('setInBookingFromEntering 에러', error);
      return;
    }

    this.addClientToEvent(client, eventId);
    this.setupEventSubscription(eventId);

    const latestData = this.latestSeatsData.get(eventId);
    if (latestData && client.readyState === WebSocket.OPEN) {
      client.send(
        JSON.stringify({
          type: 'seats-update',
          data: latestData,
        }),
      );
    }
  }

  private parseConnectionParams(req: Request): { eventId: number; sid: string } {
    const { query } = parse(req.url, true);
    const eventId = parseInt(query.eventId as string);

    const cookieHeader = req.headers['cookie'] || '';
    const cookies = parseCookie(cookieHeader);
    const sid = cookies['SID'];

    return { eventId, sid };
  }

  private validateEventId(eventId: number, client: CustomWebSocket, req: Request): boolean {
    if (!eventId || isNaN(eventId) || eventId !== 1) {
      if (eventId !== 1) {
        this.logger.error('웹소켓 벤치마크는 eventId=1 에서만 가능합니다.', req.url);
      }
      client.close(1008, '유효한 이벤트 ID가 아닙니다.');
      return false;
    }
    return true;
  }

  private addClientToEvent(client: CustomWebSocket, eventId: number): void {
    if (!this.eventClients.has(eventId)) {
      this.eventClients.set(eventId, new Set());
    }
    this.eventClients.get(eventId).add(client);

    const currentCount = this.eventConnectionCounts.get(eventId) || 0;
    this.eventConnectionCounts.set(eventId, currentCount + 1);
  }

  private setupEventSubscription(eventId: number): void {
    if (!this.eventSubscriptions.has(eventId)) {
      const observable = this.bookingSeatsService.getSeatsObservable(eventId);

      const subscription = observable.subscribe(async (seatData) => {
        this.latestSeatsData.set(eventId, seatData);
        this.broadcastToEvent(eventId, {
          type: 'seats-update',
          data: seatData,
        });
      });

      this.eventSubscriptions.set(eventId, subscription);
    }
  }

  handleDisconnect(client: CustomWebSocket): void {
    this.clients.delete(client);

    const sid = client.sid;
    const eventId = client.eventId;

    if (sid) {
      this.eventEmitter.emit('seats-sse-close', { sid });
    }

    if (eventId) {
      if (this.eventClients.has(eventId)) {
        this.eventClients.get(eventId).delete(client);
      }

      const currentCount = this.eventConnectionCounts.get(eventId) || 0;

      if (currentCount <= 1) {
        this.eventConnectionCounts.delete(eventId);
        this.eventClients.delete(eventId);
        this.latestSeatsData.delete(eventId);

        const subscription = this.eventSubscriptions.get(eventId);
        if (subscription) {
          subscription.unsubscribe();
          this.eventSubscriptions.delete(eventId);
        }
      } else {
        this.eventConnectionCounts.set(eventId, currentCount - 1);
      }
    }
  }

  private broadcastToEvent(eventId: number, message: any): void {
    const clientsInEvent = this.eventClients.get(eventId);
    if (!clientsInEvent) return;

    const messageString = JSON.stringify(message);
    clientsInEvent.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageString);
      }
    });
  }
}
