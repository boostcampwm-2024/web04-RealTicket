import { DynamicModule, Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { testDatabaseConfig } from './test-database.config';

@Global()
@Module({})
export class TestDatabaseModule {
  static forRoot(): DynamicModule {
    return {
      global: true,
      module: TestDatabaseModule,
      imports: [TypeOrmModule.forRoot(testDatabaseConfig)],
      exports: [TypeOrmModule],
    };
  }
}
