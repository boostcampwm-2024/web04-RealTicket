import { RedisService } from '@liaoliaots/nestjs-redis';
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { runGetSectionSeatsLua } from '../../domains/booking/luaScripts/getSeatsLua';

@Injectable()
export class SeatsBenchmarkService {
  private readonly redis: Redis;

  constructor(private readonly redisService: RedisService) {
    this.redis = this.redisService.getOrThrow();
  }

  async getSeatsStatusByEventId(eventId: number) {
    const sectionsLenRaw = await this.redis.get(`event:${eventId}:sections:len`);
    if (!sectionsLenRaw) return null;
    const sectionsLen = parseInt(sectionsLenRaw, 10);
    const results: (number[] | null)[] = [];
    for (let i = 0; i < sectionsLen; i++) {
      results.push(await runGetSectionSeatsLua(this.redis, eventId, i));
    }
    return results;
  }
}
