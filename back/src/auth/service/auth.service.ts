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

  async getUserIdFromSession(sid: string): Promise<[number, string] | null> {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    if (!session) return null;
    const userId = session.id;
    const userLoginId = session.loginId;
    if (!userId || !userLoginId) return null;
    return [userId, userLoginId];
  }

  async setUserStatusLogin(sid: string) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    if (session.userStatus === USER_STATUS.ADMIN) return;

    this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.LOGIN }));
  }

  async setUserStatusWaiting(sid: string) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    if (session.userStatus === USER_STATUS.ADMIN) return;

    this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.WAITING }));
  }

  async setUserStatusSelectingSeat(sid: string) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));
    if (session.userStatus === USER_STATUS.ADMIN) return;

    this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.SELECTING_SEAT }));
  }

  async setUserStatusAdmin(sid: string) {
    const session = JSON.parse(await this.redis.get(`user:${sid}`));

    this.redis.set(`user:${sid}`, JSON.stringify({ ...session, userStatus: USER_STATUS.ADMIN }));
  }

  async removeSession(sid: string, loginId: string) {
    this.redis.unlink(`user-id:${loginId}`);
    return this.redis.unlink(`user:${sid}`);
  }

  async getUserSession(sid: string) {
    return JSON.parse(await this.redis.get(`user:${sid}`));
  }
}
