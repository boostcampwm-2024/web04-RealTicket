import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

import { USER_STATUS } from 'src/auth/const/userStatus.const';
import { AuthService } from 'src/auth/service/auth.service';
import { USER_ROLE } from 'src/domains/user/const/userRole';
import { TestRedisService } from 'src/testing/redis/test-redis.service';

import {
  createEvent,
  createPlace,
  createProgram,
  createSections,
  createTestApp,
  getRedisService,
  loginAsAdmin,
  loginAsGuest,
  loginAsUser,
  setupSelectingSeat,
  withAuth,
} from './helpers/e2e-setup';

describe('Program (e2e)', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let adminSid: string;
  let placeId: number;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);
  });

  beforeEach(async () => {
    await redisService.flushAll();
    adminSid = await loginAsAdmin(app, 'pgadmin1', 'pass1234');
    placeId = await createPlace(app, adminSid);
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  // ─── Program 생성 ───

  describe('POST /program', () => {
    it('관리자 → Program 생성 성공 (201)', async () => {
      const res = await withAuth(supertest(app.getHttpServer()).post('/program'), adminSid)
        .send({
          name: '오페라의 유령',
          profileUrl: 'https://example.com/phantom.jpg',
          runningTime: 150,
          genre: 'Musical',
          actors: 'Actor X, Actor Y',
          price: 80000,
          placeId,
        })
        .expect(201);

      expect(res.body.data).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          name: '오페라의 유령',
        }),
      );
    });

    it('일반 유저 → 401', async () => {
      const guestSid = await loginAsGuest(app);

      const res = await withAuth(supertest(app.getHttpServer()).post('/program'), guestSid)
        .send({
          name: 'Test',
          profileUrl: 'url',
          runningTime: 100,
          genre: 'Drama',
          actors: 'A',
          price: 10000,
          placeId,
        })
        .expect(401);
      expect(res.body.success).toBe(false);
    });

    it('존재하지 않는 placeId → 404', async () => {
      const res = await withAuth(supertest(app.getHttpServer()).post('/program'), adminSid)
        .send({
          name: 'Test',
          profileUrl: 'url',
          runningTime: 100,
          genre: 'Drama',
          actors: 'A',
          price: 10000,
          placeId: 99999,
        })
        .expect(404);
      expect(res.body.success).toBe(false);
    });

    it('필수 필드 누락 → 400', async () => {
      const res = await withAuth(supertest(app.getHttpServer()).post('/program'), adminSid)
        .send({ name: 'Test' })
        .expect(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── Program 목록 조회 ───

  describe('GET /program', () => {
    it('비인증 상태에서도 조회 가능', async () => {
      await createProgram(app, adminSid, placeId, { name: 'Program A' });
      await createProgram(app, adminSid, placeId, { name: 'Program B' });

      const res = await supertest(app.getHttpServer()).get('/program').expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Program A' }),
          expect.objectContaining({ name: 'Program B' }),
        ]),
      );
    });

    it('응답에 place 정보가 포함된다', async () => {
      await createProgram(app, adminSid, placeId);

      const res = await supertest(app.getHttpServer()).get('/program').expect(200);

      expect(res.body.data[0]).toEqual(
        expect.objectContaining({
          place: expect.objectContaining({
            id: expect.any(Number),
            name: expect.any(String),
          }),
        }),
      );
    });

    it('resets non-admin booking session to LOGIN with null targetEvent', async () => {
      await createSections(app, adminSid, placeId);
      const programId = await createProgram(app, adminSid, placeId, { name: 'Reset Program' });
      const eventId = await createEvent(app, adminSid, programId, {
        reservationOpenDate: new Date(Date.now() - 86400000).toISOString(),
      });
      const userSid = await loginAsUser(app, 'pgreset1', 'pass1234');
      await setupSelectingSeat(app, adminSid, eventId, userSid, 1, 0);

      const beforeSession = await app.get(AuthService).getUserSession(userSid);
      expect(beforeSession).toEqual(
        expect.objectContaining({
          userStatus: USER_STATUS.SELECTING_SEAT,
          targetEvent: eventId,
        }),
      );

      await withAuth(supertest(app.getHttpServer()).get('/program'), userSid).expect(200);

      const afterSession = await app.get(AuthService).getUserSession(userSid);
      expect(afterSession).toEqual(
        expect.objectContaining({
          userStatus: USER_STATUS.LOGIN,
          targetEvent: null,
        }),
      );
    });

    it('resets explicit admin role booking sessions to LOGIN with null targetEvent while preserving roles', async () => {
      await createProgram(app, adminSid, placeId, { name: 'Admin Reset Program' });
      const redis = redisService.getOrThrow();
      const rawSession = await redis.get(`user:${adminSid}`);
      expect(rawSession).toBeTruthy();
      await redis.set(
        `user:${adminSid}`,
        JSON.stringify({
          ...JSON.parse(rawSession!),
          userStatus: USER_STATUS.WAITING,
          roles: [USER_ROLE.USER, USER_ROLE.ADMIN],
          targetEvent: 1234,
        }),
      );

      await withAuth(supertest(app.getHttpServer()).get('/program'), adminSid).expect(200);

      const afterSession = await app.get(AuthService).getUserSession(adminSid);
      expect(afterSession).toEqual(
        expect.objectContaining({
          userStatus: USER_STATUS.LOGIN,
          roles: [USER_ROLE.USER, USER_ROLE.ADMIN],
          targetEvent: null,
        }),
      );
    });
  });

  // ─── Program 상세 조회 ───

  describe('GET /program/:programId', () => {
    it('프로그램 상세 정보 + 이벤트 목록', async () => {
      const programId = await createProgram(app, adminSid, placeId, { name: '레미제라블' });
      await createEvent(app, adminSid, programId);

      const res = await supertest(app.getHttpServer()).get(`/program/${programId}`).expect(200);

      expect(res.body.data).toEqual(
        expect.objectContaining({
          id: programId,
          name: '레미제라블',
          price: expect.any(Number),
          runningTime: expect.any(Number),
          place: expect.objectContaining({ id: expect.any(Number) }),
          events: expect.any(Array),
        }),
      );
    });

    it('존재하지 않는 programId → 404', async () => {
      await supertest(app.getHttpServer()).get('/program/99999').expect(404);
    });
  });

  // ─── Program 삭제 ───

  describe('DELETE /program/:programId', () => {
    it('이벤트 없는 프로그램 삭제 → 성공', async () => {
      const programId = await createProgram(app, adminSid, placeId);

      await withAuth(supertest(app.getHttpServer()).delete(`/program/${programId}`), adminSid).expect(200);

      // 삭제 확인
      await supertest(app.getHttpServer()).get(`/program/${programId}`).expect(404);
    });

    it('이벤트가 존재하는 프로그램 삭제 → 409 Conflict', async () => {
      const programId = await createProgram(app, adminSid, placeId);
      await createEvent(app, adminSid, programId);

      await withAuth(supertest(app.getHttpServer()).delete(`/program/${programId}`), adminSid).expect(409);
    });

    it('일반 유저 → 삭제 불가', async () => {
      const programId = await createProgram(app, adminSid, placeId);
      const guestSid = await loginAsGuest(app);

      await withAuth(supertest(app.getHttpServer()).delete(`/program/${programId}`), guestSid).expect(401);
    });
  });
});
