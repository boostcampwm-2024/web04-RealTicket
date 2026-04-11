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
    // collectDefaultMetrics가 등록한 setInterval 타이머를 정리한다.
    // 테스트 환경에서 app.close() 반복 호출 시 타이머 누적을 방지한다 (WR-03).
    this.registry.clear();
  }
}
