import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { USER_STATUS } from '../const/userStatus.const';

@Injectable()
export class AuthService {
  private readonly redis: Redis | null;

  constructor(private redisService: RedisService) {
    this.redis = this.redisService.getOrThrow();
  }

  async getUserIdFromSession(sid: string): Promise<number | null> {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    if (!session) return null;
    const userId = session.id;
    if (!userId) return null;
    return userId;
  }

  async setUserStatusLogin(sid: string) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.LOGIN }));
  }

  async setUserStatusWaiting(sid: string) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.WAITING }));
  }

  async setUserStatusSelectingSeat(sid: string) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.SELECTING_SEAT }));
  }

  async setUserStatusAdmin(sid: string) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.ADMIN }));
  }

  async setUserEventTarget(sid: string, eventId: number) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    this.redis.set(`user:${sid}`, JSON.stringify({ ...session, targetEvent: eventId }));
  }

  async getUserEventTarget(sid: string) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    return session.targetEvent;
  }

  async removeSession(sid: string) {
    return this.redis.unlink(`user:${sid}`);
  }

  async getUserSession(sid: string) {
    return JSON.parse(await this.redis.get(`user:${sid}`));
  }
}
