import { TypeOrmModuleOptions } from '@nestjs/typeorm';

const ormConfig: TypeOrmModuleOptions = {
  type: process.env.DATABASE_TYPE as 'mysql',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT, 10),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_SCHEMA,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  synchronize: process.env.DATABASE_SYNCHRONIZE === 'true',
  charset: 'utf8mb4',
  timezone: 'z',
};

export default ormConfig;
