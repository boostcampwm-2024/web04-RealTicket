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

  async setUserStatusLogin(sid: string) {
    const session = JSON.parse(await this.redis.get(sid));
    this.redis.set(sid, JSON.stringify({ ...session, user_status: USER_STATUS.LOGIN }));
  }

  async setUserStatusWaiting(sid: string) {
    const session = JSON.parse(await this.redis.get(sid));
    this.redis.set(sid, JSON.stringify({ ...session, user_status: USER_STATUS.WAITING }));
  }

  async setUserStatusSelectingSeat(sid: string) {
    const session = JSON.parse(await this.redis.get(sid));
    this.redis.set(sid, JSON.stringify({ ...session, user_status: USER_STATUS.SELECTING_SEAT }));
  }

  async setUserStatusAdmin(sid: string) {
    const session = JSON.parse(await this.redis.get(sid));
    this.redis.set(sid, JSON.stringify({ ...session, user_status: USER_STATUS.ADMIN }));
  }

  async setUserEventTarget(sid: string, eventId: number) {
    const session = JSON.parse(await this.redis.get(sid));
    this.redis.set(sid, JSON.stringify({ ...session, target_event: eventId }));
  }

  async removeSession(sid: string) {
    return this.redis.unlink(sid);
  }
}
