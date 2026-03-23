import { Response } from 'express';
import { Observable, Subscription } from 'rxjs';
import { Logger as WinstonLogger } from 'winston';

interface SseClientInfo {
  res: Response;
  sid: string;
}

export interface SseBroadcasterOptions {
  retryMs?: number;
}

export class SseBroadcaster<T> {
  private clientsMap = new Map<number, Set<SseClientInfo>>();
  private subscriptionMap = new Map<number, Subscription>();
  private latestMessageMap = new Map<number, string>();
  private messageIdMap = new Map<number, number>();

  constructor(
    private readonly name: string,
    private readonly logger: WinstonLogger,
    private readonly options: SseBroadcasterOptions = {},
  ) {}

  startBroadcast(eventId: number, source$: Observable<T>): void {
    if (this.subscriptionMap.has(eventId)) {
      return;
    }
    this.messageIdMap.set(eventId, 0);

    const subscription = source$.subscribe({
      next: (data) => this.onData(eventId, data),
      error: (err) => this.logger.error(`[${this.name}] SSE 브로드캐스트 에러: eventId=${eventId}`, err),
    });

    this.subscriptionMap.set(eventId, subscription);
  }

  stopBroadcast(eventId: number): void {
    const subscription = this.subscriptionMap.get(eventId);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptionMap.delete(eventId);
    }

    const clients = this.clientsMap.get(eventId);
    if (clients) {
      for (const client of clients) {
        try {
          client.res.end();
        } catch {}
      }
      this.clientsMap.delete(eventId);
    }

    this.latestMessageMap.delete(eventId);
    this.messageIdMap.delete(eventId);
  }

  addClient(eventId: number, res: Response, sid: string): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0, no-transform',
      Pragma: 'no-cache',
      Expire: '0',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const socket = res.socket;
    if (socket) {
      socket.setKeepAlive(true);
      socket.setNoDelay(true);
      socket.setTimeout(0);
    }

    res.write('\n');

    if (!this.clientsMap.has(eventId)) {
      this.clientsMap.set(eventId, new Set());
    }
    const clientInfo: SseClientInfo = { res, sid };
    this.clientsMap.get(eventId).add(clientInfo);

    const latestMsg = this.latestMessageMap.get(eventId);
    if (latestMsg) {
      try {
        res.write(latestMsg);
      } catch {}
    }
  }

  removeClient(eventId: number, res: Response): void {
    const clients = this.clientsMap.get(eventId);
    if (!clients) return;

    for (const client of clients) {
      if (client.res === res) {
        clients.delete(client);
        break;
      }
    }

    if (clients.size === 0) {
      this.clientsMap.delete(eventId);
    }
  }

  getClientCount(eventId: number): number {
    return this.clientsMap.get(eventId)?.size ?? 0;
  }

  private onData(eventId: number, data: T): void {
    const currentId = (this.messageIdMap.get(eventId) ?? 0) + 1;
    this.messageIdMap.set(eventId, currentId);

    const jsonStr = JSON.stringify(data);
    let sseMessage = `id: ${currentId}\n`;
    if (this.options.retryMs) {
      sseMessage += `retry: ${this.options.retryMs}\n`;
    }
    sseMessage += `data: ${jsonStr}\n\n`;

    this.latestMessageMap.set(eventId, sseMessage);

    const clients = this.clientsMap.get(eventId);
    if (!clients) return;

    for (const client of clients) {
      try {
        client.res.write(sseMessage);
      } catch {
        this.logger.warn(`[${this.name}] SSE 메시지 송신 실패: sid=${client.sid}, 클라이언트 제거`);
        clients.delete(client);
        try {
          client.res.end();
        } catch {}
      }
    }
  }
}
