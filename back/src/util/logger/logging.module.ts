import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';

import { LoggerMiddleware } from './middleware/default-request-logger.middleware';

@Module({
  imports: [WinstonModule],
  providers: [LoggerMiddleware],
  exports: [],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
