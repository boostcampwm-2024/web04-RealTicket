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
  private clientsMap = new Map<string, Set<SseClientInfo>>();
  private subscriptionMap = new Map<string, Subscription>();
  private latestMessageMap = new Map<string, string>();
  private messageIdMap = new Map<string, number>();

  constructor(
    private readonly name: string,
    private readonly logger: WinstonLogger,
    private readonly options: SseBroadcasterOptions = {},
  ) {}

  startBroadcast(key: string, source$: Observable<T>): void {
    if (this.subscriptionMap.has(key)) {
      return;
    }
    this.messageIdMap.set(key, 0);

    const subscription = source$.subscribe({
      next: (data) => this.onData(key, data),
      error: (err) => this.logger.error(`[${this.name}] SSE 브로드캐스트 에러: key=${key}`, err),
    });

    this.subscriptionMap.set(key, subscription);
  }

  stopBroadcast(key: string): void {
    const subscription = this.subscriptionMap.get(key);
    if (subscription) {
      subscription.unsubscribe();
      this.subscriptionMap.delete(key);
    }

    const clients = this.clientsMap.get(key);
    if (clients) {
      for (const client of clients) {
        try {
          client.res.end();
        } catch {}
      }
      this.clientsMap.delete(key);
    }

    this.latestMessageMap.delete(key);
    this.messageIdMap.delete(key);
  }

  addClient(key: string, res: Response, sid: string): void {
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

    if (!this.clientsMap.has(key)) {
      this.clientsMap.set(key, new Set());
    }
    const clientInfo: SseClientInfo = { res, sid };
    this.clientsMap.get(key).add(clientInfo);

    const latestMsg = this.latestMessageMap.get(key);
    if (latestMsg) {
      try {
        res.write(latestMsg);
      } catch {}
    }
  }

  removeClient(key: string, res: Response): void {
    const clients = this.clientsMap.get(key);
    if (!clients) return;

    for (const client of clients) {
      if (client.res === res) {
        clients.delete(client);
        break;
      }
    }

    if (clients.size === 0) {
      this.clientsMap.delete(key);
    }
  }

  getClientBySid(key: string, sid: string): { key: string; res: Response } | null {
    const clients = this.clientsMap.get(key);
    if (!clients) return null;

    for (const client of clients) {
      if (client.sid === sid) {
        return { key, res: client.res };
      }
    }
    return null;
  }

  getClientCount(key: string): number {
    return this.clientsMap.get(key)?.size ?? 0;
  }

  private onData(key: string, data: T): void {
    const currentId = (this.messageIdMap.get(key) ?? 0) + 1;
    this.messageIdMap.set(key, currentId);

    const jsonStr = JSON.stringify(data);
    let sseMessage = `id: ${currentId}\n`;
    if (this.options.retryMs) {
      sseMessage += `retry: ${this.options.retryMs}\n`;
    }
    sseMessage += `data: ${jsonStr}\n\n`;

    this.latestMessageMap.set(key, sseMessage);

    const clients = this.clientsMap.get(key);
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
