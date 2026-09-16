import { Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Counter, Registry } from 'prom-client';

import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import {
  HTTP_REQUESTS_TOTAL_COUNTER,
  METRICS_REGISTRY,
  createHttpRequestsTotalCounter,
  createMetricsRegistry,
} from './metrics.registry';

@Module({
  controllers: [MetricsController],
  providers: [
    {
      provide: METRICS_REGISTRY,
      useFactory: (): Registry => createMetricsRegistry(),
    },
    {
      provide: HTTP_REQUESTS_TOTAL_COUNTER,
      useFactory: (registry: Registry): Counter<string> => createHttpRequestsTotalCounter(registry),
      inject: [METRICS_REGISTRY],
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
  ],
  exports: [METRICS_REGISTRY, HTTP_REQUESTS_TOTAL_COUNTER],
})
export class MetricsModule implements OnApplicationShutdown {
  constructor(
    @Inject(METRICS_REGISTRY)
    private readonly registry: Registry,
  ) {}

  onApplicationShutdown(): void {
    this.registry.clear();
  }
}
