import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

import { TestRedisService } from 'src/testing/redis/test-redis.service';

import {
  bookSeat,
  createEvent,
  createPlace,
  createProgram,
  createSections,
  createTestApp,
  getRedisService,
  loginAsAdmin,
  loginAsUser,
  openEventReservation,
  requestPermission,
  setBookingCount,
  setupSelectingSeat,
  simulateSseCloseTimeout,
  simulateSseDisconnect,
  transitionToSelectingSeat,
  withAuth,
} from './helpers/e2e-setup';

describe('Reservation (e2e)', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let adminSid: string;
  let placeId: number;
  let programId: number;
  let eventId: number;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);

    adminSid = await loginAsAdmin(app, 'rsadmin1', 'pass1234');
    placeId = await createPlace(app, adminSid);
    await createSections(app, adminSid, placeId, [
      { name: 'A', colLen: 3, seats: [1, 1, 1, 1, 1, 1], order: 0 },
    ]);
    programId = await createProgram(app, adminSid, placeId);
    eventId = await createEvent(app, adminSid, programId, {
      reservationOpenDate: new Date(Date.now() - 86400000).toISOString(),
    });
  });

  beforeEach(async () => {
    await redisService.flushAll();
    adminSid = await loginAsAdmin(app, 'rsadmin1', 'pass1234');
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  // ─── 예매 확정 ───

  describe('POST /reservation', () => {
    it('좌석 선점 후 예매 확정 → 성공', async () => {
      const userSid = await loginAsUser(app, 'resuser1', 'pass1234');
      await setupSelectingSeat(app, adminSid, eventId, userSid, 2);

      // 좌석 2개 점유
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);
      await bookSeat(app, userSid, eventId, 0, 1, 'reserved').expect(201);

      // 예매 확정
      const res = await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSid)
        .send({
          eventId,
          seats: [
            { sectionIndex: 0, seatIndex: 0 },
            { sectionIndex: 0, seatIndex: 1 },
          ],
        })
        .expect(201);

      expect(res.body.data).toEqual(
        expect.objectContaining({
          programName: expect.any(String),
          runningDate: expect.any(String),
          price: expect.any(Number),
        }),
      );
      expect(res.body.data.seats).toHaveLength(2);
    });

    it('선점하지 않은 좌석 포함 → 400', async () => {
      const userSid = await loginAsUser(app, 'resuser2', 'pass1234');
      await setupSelectingSeat(app, adminSid, eventId, userSid, 2);

      // 좌석 1개만 점유
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      // 점유하지 않은 좌석 포함하여 예매 시도
      const rErrRes1 = await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSid)
        .send({
          eventId,
          seats: [
            { sectionIndex: 0, seatIndex: 0 },
            { sectionIndex: 0, seatIndex: 3 },
          ],
        })
        .expect(400);
      expect(rErrRes1.body.success).toBe(false);
    });

    it('LOGIN 상태에서 예매 시도 → 401', async () => {
      const userSid = await loginAsUser(app, 'resuser3', 'pass1234');

      const rErrRes2 = await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSid)
        .send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 0 }] })
        .expect(401);
      expect(rErrRes2.body.success).toBe(false);
    });
  });

  // ─── 예매 내역 조회 ───

  describe('GET /reservation', () => {
    it('예매 후 내역 조회 → 배열 반환', async () => {
      const userSid = await loginAsUser(app, 'resget01', 'pass1234');
      await setupSelectingSeat(app, adminSid, eventId, userSid, 1);
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSid)
        .send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 0 }] })
        .expect(201);

      const res = await withAuth(supertest(app.getHttpServer()).get('/reservation'), userSid).expect(200);

      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0]).toEqual(
        expect.objectContaining({
          id: expect.any(Number),
          programName: expect.any(String),
        }),
      );
    });

    it('예매 없는 유저 → 빈 배열', async () => {
      const userSid = await loginAsUser(app, 'resget02', 'pass1234');

      const res = await withAuth(supertest(app.getHttpServer()).get('/reservation'), userSid).expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('미인증 → 403', async () => {
      await supertest(app.getHttpServer()).get('/reservation').expect(403);
    });
  });

  // ─── 예매 삭제 ───

  describe('DELETE /reservation/:reservationId', () => {
    it('자신의 예매 삭제 → 200', async () => {
      // 예매 생성
      const userSid = await loginAsUser(app, 'resdel01', 'pass1234');
      await setupSelectingSeat(app, adminSid, eventId, userSid, 1);
      await bookSeat(app, userSid, eventId, 0, 2, 'reserved').expect(201);

      await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSid)
        .send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 2 }] })
        .expect(201);

      // 예매 ID 조회
      const listRes = await withAuth(supertest(app.getHttpServer()).get('/reservation'), userSid).expect(200);
      const reservationId = listRes.body.data[listRes.body.data.length - 1].id;

      // 삭제
      await withAuth(supertest(app.getHttpServer()).delete(`/reservation/${reservationId}`), userSid).expect(
        200,
      );

      // 삭제 후 조회 → 목록에서 제거됨
      const afterRes = await withAuth(supertest(app.getHttpServer()).get('/reservation'), userSid).expect(
        200,
      );
      const ids = afterRes.body.data.map((r: { id: number }) => r.id);
      expect(ids).not.toContain(reservationId);
    });

    it('존재하지 않는 예매 삭제 → 400', async () => {
      const userSid = await loginAsUser(app, 'resdel02', 'pass1234');

      await withAuth(supertest(app.getHttpServer()).delete('/reservation/999999'), userSid).expect(400);
    });

    it('타인의 예매 삭제 시도 → 400 (RESERVATION_FORBIDDEN)', async () => {
      const userSidA = await loginAsUser(app, 'resdel03', 'pass1234');
      await setupSelectingSeat(app, adminSid, eventId, userSidA, 1);
      await bookSeat(app, userSidA, eventId, 0, 3, 'reserved').expect(201);
      await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSidA)
        .send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 3 }] })
        .expect(201);

      const listRes = await withAuth(supertest(app.getHttpServer()).get('/reservation'), userSidA).expect(
        200,
      );
      const reservationId = listRes.body.data[listRes.body.data.length - 1].id;

      const userSidB = await loginAsUser(app, 'resdel04', 'pass1234');
      await withAuth(supertest(app.getHttpServer()).delete(`/reservation/${reservationId}`), userSidB).expect(
        400,
      );
    });

    it('미인증 → 403', async () => {
      await supertest(app.getHttpServer()).delete('/reservation/1').expect(403);
    });
  });

  // ─── 통합 시나리오 ───

  describe('전체 예매 플로우', () => {
    it('입장 → 인원 설정 → 좌석 점유 → 예매 확정 → 내역 조회', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'flow0001', 'pass1234');

      // 1. 입장 허가
      const permRes = await requestPermission(app, userSid, eventId).expect(200);
      expect(permRes.body.data.enteringStatus).toBe(true);

      // 2. 인원 설정
      await setBookingCount(app, userSid, 1).expect(201);

      // 3. 좌석 선택 상태 전환 (SSE 우회)
      await transitionToSelectingSeat(app, userSid);

      // 4. 좌석 점유
      await bookSeat(app, userSid, eventId, 0, 3, 'reserved').expect(201);

      // 5. 예매 확정
      const reserveRes = await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSid)
        .send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 3 }] })
        .expect(201);
      expect(reserveRes.body.data.programName).toBeDefined();
      expect(reserveRes.body.data.seats).toHaveLength(1);

      // 6. 예매 내역 조회
      const listRes = await withAuth(supertest(app.getHttpServer()).get('/reservation'), userSid).expect(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('1회차 예매 확정 → SSE 해제 → 2회차 예매 (상태 순환 검증)', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'flow0002', 'pass1234');

      // ── 1회차: 입장 → 좌석 점유 → 예매 확정 ──
      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSid)
        .send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 0 }] })
        .expect(201);

      // ── SSE 해제: 페이지 이동 시뮬레이션 ──
      await simulateSseDisconnect(app, userSid);
      await simulateSseCloseTimeout(app, userSid);

      // 상태가 LOGIN으로 복귀했는지 확인
      await bookSeat(app, userSid, eventId, 0, 1, 'reserved').expect(401);

      // ── 2회차: 같은 유저가 다시 예매 플로우 진입 ──
      const permRes = await requestPermission(app, userSid, eventId).expect(200);
      expect(permRes.body.data.enteringStatus).toBe(true);

      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);

      // 1회차에서 점유한 좌석(0,0)은 예매 확정됐으므로 여전히 점유 중
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(409);

      // 다른 좌석 점유 → 2회차 예매 확정
      await bookSeat(app, userSid, eventId, 0, 1, 'reserved').expect(201);

      await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSid)
        .send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 1 }] })
        .expect(201);

      // 예매 내역에 2건 존재
      const listRes = await withAuth(supertest(app.getHttpServer()).get('/reservation'), userSid).expect(200);
      expect(listRes.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });
});
