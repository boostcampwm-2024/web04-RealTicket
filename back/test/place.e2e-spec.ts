import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

import { TestRedisService } from 'src/testing/redis/test-redis.service';

import {
  createPlace,
  createSections,
  createTestApp,
  getRedisService,
  loginAsAdmin,
  loginAsGuest,
  withAuth,
} from './helpers/e2e-setup';

describe('Place (e2e)', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let adminSid: string;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);
    adminSid = await loginAsAdmin(app);
  });

  beforeEach(async () => {
    await redisService.flushAll();
    adminSid = await loginAsAdmin(app, 'padmin01', 'pass1234');
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  // ─── Place 생성 ───

  describe('POST /place', () => {
    it('관리자 → Place 생성 성공 (201)', async () => {
      const res = await withAuth(supertest(app.getHttpServer()).post('/place'), adminSid)
        .send({
          name: '세종문화회관',
          address: '서울시 종로구',
          overviewSvg: '<svg></svg>',
          overviewHeight: 600,
          overviewWidth: 900,
          overviewPoints: '[]',
        })
        .expect(201);

      expect(res.body.data).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          name: '세종문화회관',
        }),
      );
    });

    it('일반 유저 → 403/401', async () => {
      const guestSid = await loginAsGuest(app);

      const pErrRes1 = await withAuth(supertest(app.getHttpServer()).post('/place'), guestSid)
        .send({
          name: 'Test',
          address: 'Addr',
          overviewSvg: '<svg></svg>',
          overviewHeight: 100,
          overviewWidth: 100,
          overviewPoints: '[]',
        })
        .expect(401);
      expect(pErrRes1.body.success).toBe(false);
    });

    it('필수 필드 누락 → 400', async () => {
      const pErrRes2 = await withAuth(supertest(app.getHttpServer()).post('/place'), adminSid)
        .send({ name: 'Test' })
        .expect(400);
      expect(pErrRes2.body.success).toBe(false);
    });
  });

  // ─── Section 생성 ───

  describe('POST /place/section', () => {
    it('Section 추가 성공', async () => {
      const placeId = await createPlace(app, adminSid);

      await createSections(app, adminSid, placeId, [
        { name: 'A구역', colLen: 5, seats: [1, 1, 1, 1, 1], order: 0 },
        { name: 'B구역', colLen: 3, seats: [1, 0, 1], order: 1 },
      ]);
    });

    it('존재하지 않는 Place에 Section 추가 → 404', async () => {
      const res = await withAuth(supertest(app.getHttpServer()).post('/place/section'), adminSid)
        .send([{ name: 'A구역', colLen: 3, seats: [1, 1, 1], placeId: 99999, order: 0 }])
        .expect(404);
      expect(res.body.success).toBe(false);
    });

    it('seats 빈 배열 전송 시 400 (VALIDATION_ERROR)', async () => {
      const placeId = await createPlace(app, adminSid);
      await withAuth(supertest(app.getHttpServer()).post('/place/section'), adminSid)
        .send([{ name: 'A구역', colLen: 3, seats: [], placeId, order: 0 }])
        .expect(400);
    });

    it('Section 추가 성공 응답에 data 필드 존재', async () => {
      const placeId = await createPlace(app, adminSid);
      // Phase 5부터 E2E 환경에서도 ResponseWrapperInterceptor가 등록되어 { success: true, data: null }을 반환한다.
      const res = await withAuth(supertest(app.getHttpServer()).post('/place/section'), adminSid)
        .send([{ name: 'A구역', colLen: 3, seats: [1, 1, 1], placeId, order: 0 }])
        .expect(201);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── 좌석 조회 ───

  describe('GET /place/seat/:placeId', () => {
    it('Place + Section 생성 후 좌석 정보 조회', async () => {
      const placeId = await createPlace(app, adminSid, { name: '좌석 조회 테스트 홀' });
      await createSections(app, adminSid, placeId, [
        { name: 'VIP석', colLen: 4, seats: [1, 1, 1, 1, 1, 1, 1, 1], order: 0 },
      ]);

      const res = await supertest(app.getHttpServer()).get(`/place/seat/${placeId}`).expect(200);

      expect(res.body.data).toEqual(
        expect.objectContaining({
          id: placeId,
          layout: expect.objectContaining({
            sections: expect.arrayContaining([
              expect.objectContaining({
                name: 'VIP석',
                colLen: 4,
              }),
            ]),
          }),
        }),
      );
    });

    it('존재하지 않는 Place → 404', async () => {
      await supertest(app.getHttpServer()).get('/place/seat/99999').expect(404);
    });
  });

  // ─── Place 삭제 ───

  describe('DELETE /place/:placeId', () => {
    it('관리자 → Place 삭제 성공', async () => {
      const placeId = await createPlace(app, adminSid);

      await withAuth(supertest(app.getHttpServer()).delete(`/place/${placeId}`), adminSid).expect(200);

      // 삭제 후 조회 → 404
      await supertest(app.getHttpServer()).get(`/place/seat/${placeId}`).expect(404);
    });

    it('일반 유저 → 삭제 불가', async () => {
      const placeId = await createPlace(app, adminSid);
      const guestSid = await loginAsGuest(app);

      await withAuth(supertest(app.getHttpServer()).delete(`/place/${placeId}`), guestSid).expect(401);
    });
  });
});
