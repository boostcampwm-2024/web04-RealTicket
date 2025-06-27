import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';

import { DetailedRequestLoggingInterceptor } from './interceptor/detailed-request-logger.interceptor';
import { LoggerMiddleware } from './middleware/default-request-logger.middleware';

@Module({
  imports: [WinstonModule],
  providers: [LoggerMiddleware, DetailedRequestLoggingInterceptor],
  exports: [DetailedRequestLoggingInterceptor],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
