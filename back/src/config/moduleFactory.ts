/* eslint-disable @typescript-eslint/no-require-imports */
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import redisConfig from './redisConfig';
import ormConfig from './typeOrmConfig';

const isTestMode = process.env.NODE_ENV === 'test';

export function getDatabaseModule(): DynamicModule | typeof TypeOrmModule {
  if (isTestMode) {
    const { TestDatabaseModule } = require('../testing/database/test-database.module');
    return TestDatabaseModule.forRoot();
  }
  return TypeOrmModule.forRoot(ormConfig);
}

export function getRedisModule(): DynamicModule | any {
  if (isTestMode) {
    const { TestRedisModule } = require('../testing/redis/test-redis.module');
    return TestRedisModule;
  }
  return RedisModule.forRoot(redisConfig);
}
