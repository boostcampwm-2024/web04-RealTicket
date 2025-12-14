import { RedisService } from '@liaoliaots/nestjs-redis';
import { Global, Module } from '@nestjs/common';

import { TestRedisService } from './test-redis.service';

@Global()
@Module({
  providers: [
    TestRedisService,
    {
      provide: RedisService,
      useExisting: TestRedisService,
    },
  ],
  exports: [TestRedisService, RedisService],
})
export class TestRedisModule {}
