import { Counter, Registry, collectDefaultMetrics } from 'prom-client';

export const METRICS_REGISTRY = Symbol('METRICS_REGISTRY');
export const HTTP_REQUESTS_TOTAL_COUNTER = Symbol('HTTP_REQUESTS_TOTAL_COUNTER');

/**
 * 테스트 격리를 위해 globalRegistry 대신 new Registry() 인스턴스를 사용한다 (D-01).
 * Node.js 기본 지표(CPU, 메모리, GC, event loop lag)는 collectDefaultMetrics로 자동 수집한다 (D-02).
 */
export function createMetricsRegistry(): Registry {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  return registry;
}

/**
 * http_requests_total Counter 생성.
 * 라벨: method(GET/POST/...), path(NestJS 라우트 패턴), status(HTTP 상태 코드 문자열)
 */
export function createHttpRequestsTotalCounter(registry: Registry): Counter<string> {
  return new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests received by this NestJS instance',
    labelNames: ['method', 'path', 'status'],
    registers: [registry],
  });
}
