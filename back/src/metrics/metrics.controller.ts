import { Controller, Get, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import { Registry } from 'prom-client';

import { METRICS_REGISTRY } from './metrics.registry';

@Controller('metrics')
export class MetricsController {
  constructor(@Inject(METRICS_REGISTRY) private readonly registry: Registry) {}

  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    const body = await this.registry.metrics();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    // Express가 Content-Type을 재작성하지 않도록 직접 종료한다.
    res.end(body);
  }
}
