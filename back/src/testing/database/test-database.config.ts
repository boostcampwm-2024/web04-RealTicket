import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const testDatabaseConfig: TypeOrmModuleOptions = {
  type: 'better-sqlite3',
  database: ':memory:',
  entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
  synchronize: true,
  dropSchema: true,
};
