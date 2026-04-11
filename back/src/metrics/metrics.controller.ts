import { Controller, Get, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import { Registry } from 'prom-client';

import { METRICS_REGISTRY } from './metrics.registry';

@Controller('metrics')
export class MetricsController {
  constructor(@Inject(METRICS_REGISTRY) private readonly registry: Registry) {}

  /**
   * Prometheus scrape 엔드포인트 (METRICS-01).
   * Content-Type은 prom-client v15의 registry.contentType과 동일한
   * 'text/plain; version=0.0.4; charset=utf-8'을 고정 반환한다 (D-05).
   * res.end()를 사용해 Express의 charset 자동 추가로 인한 헤더 순서 변경을 방지한다.
   * IP 제한 없음 — Docker Swarm overlay 네트워크 내부 격리 (D-06).
   */
  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    const body = await this.registry.metrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.end(body);
  }
}
