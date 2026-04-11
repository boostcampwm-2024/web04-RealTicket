import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

import { createTestApp } from './helpers/e2e-setup';

describe('Metrics (e2e) — /metrics + http_requests_total', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /metrics', () => {
    it('Prometheus exposition 포맷으로 http_requests_total 메타데이터를 반환한다 (METRICS-01)', async () => {
      const res = await supertest(app.getHttpServer()).get('/metrics').expect(200);

      expect(res.headers['content-type']).toBe('text/plain; version=0.0.4; charset=utf-8');
      expect(res.text).toContain('# HELP http_requests_total');
      expect(res.text).toContain('# TYPE http_requests_total counter');
    });

    it('Node.js 기본 메트릭이 collectDefaultMetrics에 의해 수집된다', async () => {
      const res = await supertest(app.getHttpServer()).get('/metrics').expect(200);

      // collectDefaultMetrics가 추가하는 대표적인 두 가지 지표 중 하나 이상 포함
      const hasDefaultMetric =
        res.text.includes('process_cpu_user_seconds_total') ||
        res.text.includes('nodejs_eventloop_lag_seconds');
      expect(hasDefaultMetric).toBe(true);
    });
  });

  describe('MetricsInterceptor — http_requests_total 카운터 (METRICS-02)', () => {
    it('일반 요청을 한 번 수행하면 http_requests_total 라벨 샘플이 1 이상으로 증가한다', async () => {
      // 임의의 엔드포인트 호출 (AppController GET /)
      await supertest(app.getHttpServer()).get('/').expect(200);

      const res = await supertest(app.getHttpServer()).get('/metrics').expect(200);
      const body = res.text;

      // path="/" 라벨 + status="200" 샘플이 1.0 이상
      const sampleRegex =
        /http_requests_total\{[^}]*method="GET"[^}]*path="\/"[^}]*status="200"[^}]*\}\s+(\d+(?:\.\d+)?)/;
      const match = body.match(sampleRegex);
      expect(match).not.toBeNull();
      expect(Number(match![1])).toBeGreaterThanOrEqual(1);
    });

    it('/metrics 경로 자체는 http_requests_total에 카운트되지 않는다', async () => {
      // /metrics를 3번 호출
      await supertest(app.getHttpServer()).get('/metrics').expect(200);
      await supertest(app.getHttpServer()).get('/metrics').expect(200);
      await supertest(app.getHttpServer()).get('/metrics').expect(200);

      const res = await supertest(app.getHttpServer()).get('/metrics').expect(200);

      // path="/metrics" 라벨을 가진 샘플이 없어야 한다
      expect(res.text).not.toMatch(/http_requests_total\{[^}]*path="\/metrics"/);
    });
  });
});
