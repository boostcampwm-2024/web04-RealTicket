import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

export const METRICS_REGISTRY = Symbol('METRICS_REGISTRY');
export const HTTP_REQUESTS_TOTAL_COUNTER = Symbol('HTTP_REQUESTS_TOTAL_COUNTER');

// 테스트 간 지표가 섞이지 않도록 독립 Registry를 사용한다.
export function createMetricsRegistry(): Registry {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  return registry;
}

export function createHttpRequestsTotalCounter(registry: Registry): Counter<string> {
  return new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests received by this NestJS instance',
    labelNames: ['method', 'path', 'status'],
    registers: [registry],
  });
}
