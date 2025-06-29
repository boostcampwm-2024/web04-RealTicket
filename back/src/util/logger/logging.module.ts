import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';

import { RequestLoggingInterceptor } from './interceptor/request-logging.interceptor';
import { RequestLoggingMiddleware } from './middleware/request-logging.middleware';
import { RequestLoggingService } from './service/request-logging.service';
import { LoggingDetailType } from './types/logging.types';
import { winstonConfig } from './winston.config';

const DefaultRequestLoggingMiddleware = RequestLoggingMiddleware.instantiate({
  includeDetails: [LoggingDetailType.RESPONSE_TIME, LoggingDetailType.STATUS_CODE],
  loggerName: 'Default-API',
});

export const FullRequestLoggingInterceptor = RequestLoggingInterceptor.instantiate({
  excludeDetails: [],
  loggerName: 'Full-API',
});

@Module({
  imports: [WinstonModule.forRoot(winstonConfig)],
  providers: [
    RequestLoggingService,
    RequestLoggingInterceptor,
    RequestLoggingMiddleware,

    DefaultRequestLoggingMiddleware,
    FullRequestLoggingInterceptor,
  ],
  exports: [
    RequestLoggingService,
    RequestLoggingInterceptor,
    RequestLoggingMiddleware,

    FullRequestLoggingInterceptor,
  ],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(DefaultRequestLoggingMiddleware).forRoutes('*');
  }
}
