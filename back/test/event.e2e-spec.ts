import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

import { TestRedisService } from 'src/testing/redis/test-redis.service';

import {
  createEvent,
  createPlace,
  createProgram,
  createTestApp,
  getRedisService,
  loginAsAdmin,
  loginAsGuest,
  loginUser,
  signup,
  withAuth,
} from './helpers/e2e-setup';

describe('Event (e2e)', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let adminSid: string;
  let placeId: number;
  let programId: number;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);
  });

  beforeEach(async () => {
    await redisService.flushAll();
    adminSid = await loginAsAdmin(app, 'evadmin1', 'pass1234');
    placeId = await createPlace(app, adminSid);
    programId = await createProgram(app, adminSid, placeId);
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  // ─── Event 생성 ───

  describe('POST /event', () => {
    it('관리자 → Event 생성 성공 (201)', async () => {
      const now = new Date();
      const res = await withAuth(supertest(app.getHttpServer()).post('/event'), adminSid)
        .send({
          runningDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          reservationOpenDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
          reservationCloseDate: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          programId,
        })
        .expect(201);

      expect(res.body.data).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
        }),
      );
    });

    it('일반 유저 → 401', async () => {
      const guestSid = await loginAsGuest(app);
      const now = new Date();

      const eRes1 = await withAuth(supertest(app.getHttpServer()).post('/event'), guestSid)
        .send({
          runningDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          reservationOpenDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
          reservationCloseDate: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          programId,
        })
        .expect(401);
      expect(eRes1.body.success).toBe(false);
    });

    it('날짜 순서 위반 (openDate > closeDate) → 400', async () => {
      const now = new Date();

      const eRes2 = await withAuth(supertest(app.getHttpServer()).post('/event'), adminSid)
        .send({
          runningDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          reservationOpenDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString(),
          reservationCloseDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
          programId,
        })
        .expect(400);
      expect(eRes2.body.success).toBe(false);
    });

    it('존재하지 않는 programId → 404', async () => {
      const now = new Date();

      const eRes3 = await withAuth(supertest(app.getHttpServer()).post('/event'), adminSid)
        .send({
          runningDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          reservationOpenDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
          reservationCloseDate: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString(),
          programId: 99999,
        })
        .expect(404);
      expect(eRes3.body.success).toBe(false);
    });

    it('필수 필드 누락 → 400', async () => {
      const eRes4 = await withAuth(supertest(app.getHttpServer()).post('/event'), adminSid)
        .send({ programId })
        .expect(400);
      expect(eRes4.body.success).toBe(false);
    });
  });

  // ─── Event 조회 ───

  describe('GET /event/:eventId', () => {
    it('인증된 사용자 → Event 상세 조회', async () => {
      const eventId = await createEvent(app, adminSid, programId);

      await signup(app, 'evuser01', 'pass1234');
      const userSid = await loginUser(app, 'evuser01', 'pass1234');

      const res = await withAuth(supertest(app.getHttpServer()).get(`/event/${eventId}`), userSid).expect(
        200,
      );

      expect(res.body.data).toEqual(
        expect.objectContaining({
          id: eventId,
          name: expect.any(String),
          place: expect.objectContaining({ id: expect.any(Number) }),
          price: expect.any(Number),
          runningTime: expect.any(Number),
          runningDate: expect.any(String),
          reservationOpenDate: expect.any(String),
          reservationCloseDate: expect.any(String),
        }),
      );
    });

    it('미인증 → 403', async () => {
      const eventId = await createEvent(app, adminSid, programId);

      await supertest(app.getHttpServer()).get(`/event/${eventId}`).expect(403);
    });

    it('존재하지 않는 eventId → 404', async () => {
      await withAuth(supertest(app.getHttpServer()).get('/event/99999'), adminSid).expect(404);
    });
  });

  // ─── Event 삭제 ───

  describe('DELETE /event/:eventId', () => {
    it('관리자 → Event 삭제 성공', async () => {
      const eventId = await createEvent(app, adminSid, programId);

      await withAuth(supertest(app.getHttpServer()).delete(`/event/${eventId}`), adminSid).expect(200);

      // 삭제 확인
      await withAuth(supertest(app.getHttpServer()).get(`/event/${eventId}`), adminSid).expect(404);
    });

    it('일반 유저 → 삭제 불가', async () => {
      const eventId = await createEvent(app, adminSid, programId);
      const guestSid = await loginAsGuest(app);

      await withAuth(supertest(app.getHttpServer()).delete(`/event/${eventId}`), guestSid).expect(401);
    });
  });

  // ─── 통합 시나리오 ───

  describe('데이터 연관관계 플로우', () => {
    it('Place → Program → Event 생성 → Program 상세에서 Event 확인', async () => {
      const myPlaceId = await createPlace(app, adminSid, { name: '통합 테스트 홀' });
      const myProgramId = await createProgram(app, adminSid, myPlaceId, { name: '통합 테스트 공연' });
      await createEvent(app, adminSid, myProgramId);
      await createEvent(app, adminSid, myProgramId);

      // Program 상세에서 Event 2개 확인
      const res = await supertest(app.getHttpServer()).get(`/program/${myProgramId}`).expect(200);

      expect(res.body.data.name).toBe('통합 테스트 공연');
      expect(res.body.data.events.length).toBe(2);
    });

    it('Event가 있는 Program 삭제 시도 → 409', async () => {
      const myProgramId = await createProgram(app, adminSid, placeId);
      await createEvent(app, adminSid, myProgramId);

      await withAuth(supertest(app.getHttpServer()).delete(`/program/${myProgramId}`), adminSid).expect(409);
    });

    it('Event 삭제 후 Program 삭제 가능', async () => {
      const myProgramId = await createProgram(app, adminSid, placeId);
      const myEventId = await createEvent(app, adminSid, myProgramId);

      // Event 먼저 삭제
      await withAuth(supertest(app.getHttpServer()).delete(`/event/${myEventId}`), adminSid).expect(200);

      // 이제 Program 삭제 가능
      await withAuth(supertest(app.getHttpServer()).delete(`/program/${myProgramId}`), adminSid).expect(200);
    });
  });
});
