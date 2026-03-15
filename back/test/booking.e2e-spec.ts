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
  transitionToSelectingSeat,
  withAuth,
} from './helpers/e2e-setup';

describe('Booking (e2e)', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let adminSid: string;
  let placeId: number;
  let programId: number;
  let eventId: number;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);

    // DB 데이터 생성 (앱 인스턴스 수명 동안 유지)
    adminSid = await loginAsAdmin(app, 'bkadmin1', 'pass1234');
    placeId = await createPlace(app, adminSid);
    await createSections(app, adminSid, placeId, [
      { name: 'A', colLen: 3, seats: [1, 1, 1, 1, 1, 1], order: 0 },
      { name: 'B', colLen: 2, seats: [1, 1, 1, 1], order: 1 },
    ]);
    programId = await createProgram(app, adminSid, placeId);
    eventId = await createEvent(app, adminSid, programId, {
      reservationOpenDate: new Date(Date.now() - 86400000).toISOString(),
    });
  });

  beforeEach(async () => {
    await redisService.flushAll();
    adminSid = await loginAsAdmin(app, 'bkadmin1', 'pass1234');
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  // ─── 서버 시간 ───

  describe('GET /booking/server-time', () => {
    it('인증된 사용자 → 서버 시간 반환', async () => {
      const userSid = await loginAsUser(app, 'timeuser1', 'pass1234');
      const before = Date.now();

      const res = await withAuth(supertest(app.getHttpServer()).get('/booking/server-time'), userSid).expect(
        200,
      );

      const after = Date.now();
      expect(res.body.now).toBeGreaterThanOrEqual(before);
      expect(res.body.now).toBeLessThanOrEqual(after);
    });

    it('미인증 → 403', async () => {
      await supertest(app.getHttpServer()).get('/booking/server-time').expect(403);
    });
  });

  // ─── 입장 허가 ───

  describe('GET /booking/permission/:eventId', () => {
    it('예약이 오픈된 이벤트 → 입장 허가 (enteringStatus)', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'permuser1', 'pass1234');

      const res = await requestPermission(app, userSid, eventId).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          enteringStatus: true,
          waitingStatus: false,
        }),
      );
    });

    it('예약이 오픈되지 않은 이벤트 → 400', async () => {
      // Redis flushed 상태, 이벤트 미오픈
      const userSid = await loginAsUser(app, 'permuser2', 'pass1234');

      await requestPermission(app, userSid, eventId).expect(400);
    });

    it('인원 초과 시 대기열로 진입 (waitingStatus)', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      // maxSize를 1로 제한
      await withAuth(
        supertest(app.getHttpServer()).post(`/booking/in-booking-pool-size/event/${eventId}`),
        adminSid,
      )
        .send({ maxSize: 1 })
        .expect(201);

      // 1번 유저: 입장 → SELECTING_SEAT (슬롯 점유)
      const user1Sid = await loginAsUser(app, 'permuser3', 'pass1234');
      await requestPermission(app, user1Sid, eventId).expect(200);
      await setBookingCount(app, user1Sid, 1).expect(201);
      await transitionToSelectingSeat(app, user1Sid);

      // 2번 유저: maxSize=1이므로 대기열
      const user2Sid = await loginAsUser(app, 'permuser4', 'pass1234');
      const res = await requestPermission(app, user2Sid, eventId).expect(200);

      expect(res.body.waitingStatus).toBe(true);
      expect(res.body.userOrder).toBeDefined();
    });

    it('미인증 → 403', async () => {
      await supertest(app.getHttpServer()).get(`/booking/permission/${eventId}`).expect(403);
    });
  });

  // ─── 예매 인원 설정 ───

  describe('POST /booking/count', () => {
    it('ENTERING 상태에서 인원 설정 → 성공', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'cntuser1', 'pass1234');
      await requestPermission(app, userSid, eventId).expect(200);

      const res = await setBookingCount(app, userSid, 2).expect(201);

      expect(res.body.bookingAmount).toBe(2);
    });

    it('범위 밖 인원(0, 5) → 400', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'cntuser2', 'pass1234');
      await requestPermission(app, userSid, eventId).expect(200);

      await setBookingCount(app, userSid, 0).expect(400);
      await setBookingCount(app, userSid, 5).expect(400);
    });

    it('LOGIN 상태에서 → 401', async () => {
      const userSid = await loginAsUser(app, 'cntuser3', 'pass1234');

      await setBookingCount(app, userSid, 1).expect(401);
    });
  });

  // ─── 좌석 점유/취소 ───

  describe('POST /booking (좌석 점유)', () => {
    let userSid: string;

    beforeEach(async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      userSid = await loginAsUser(app, 'seatusr1', 'pass1234');
      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 2).expect(201);
      await transitionToSelectingSeat(app, userSid);
    });

    it('좌석 점유 → 성공', async () => {
      const res = await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      expect(res.body).toEqual(
        expect.objectContaining({
          sectionIndex: 0,
          seatIndex: 0,
          acceptedStatus: 'reserved',
        }),
      );
    });

    it('이미 점유된 좌석 재점유 → 409 Conflict', async () => {
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(409);
    });

    it('좌석 취소 → 성공', async () => {
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      const res = await bookSeat(app, userSid, eventId, 0, 0, 'deleted').expect(201);

      expect(res.body.acceptedStatus).toBe('deleted');
    });

    it('예매 수량 초과 → 400', async () => {
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);
      await bookSeat(app, userSid, eventId, 0, 1, 'reserved').expect(201);

      // bookingAmount=2인데 3번째 좌석 점유 시도
      await bookSeat(app, userSid, eventId, 0, 2, 'reserved').expect(400);
    });

    it('LOGIN 상태에서 좌석 점유 → 401', async () => {
      const loginOnlySid = await loginAsUser(app, 'seatusr2', 'pass1234');

      await bookSeat(app, loginOnlySid, eventId, 0, 0, 'reserved').expect(401);
    });
  });

  // ─── 관리자: 인원 풀 설정 ───

  describe('Admin: 인원 풀 설정', () => {
    it('이벤트별 maxSize 설정', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      const res = await withAuth(
        supertest(app.getHttpServer()).post(`/booking/in-booking-pool-size/event/${eventId}`),
        adminSid,
      )
        .send({ maxSize: 50 })
        .expect(201);

      expect(res.body.maxSize).toBe(50);
    });

    it('전체 이벤트 maxSize 설정', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      const res = await withAuth(
        supertest(app.getHttpServer()).post('/booking/in-booking-pool-size/all'),
        adminSid,
      )
        .send({ maxSize: 100 })
        .expect(201);

      expect(res.body.maxSize).toBe(100);
    });

    it('기본값 maxSize 설정', async () => {
      const res = await withAuth(
        supertest(app.getHttpServer()).post('/booking/in-booking-pool-size/default'),
        adminSid,
      )
        .send({ maxSize: 200 })
        .expect(201);

      expect(res.body.maxSize).toBe(200);
    });

    it('일반 유저 → 401', async () => {
      const userSid = await loginAsUser(app, 'pooluser1', 'pass1234');

      await withAuth(supertest(app.getHttpServer()).post('/booking/in-booking-pool-size/default'), userSid)
        .send({ maxSize: 100 })
        .expect(401);
    });
  });

  // ─── 관리자: 예약 초기화 ───

  describe('POST /booking/init/:eventId', () => {
    it('관리자가 예약 초기화 → 성공', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      // 재초기화
      await openEventReservation(app, adminSid, eventId).expect(201);
    });

    it('일반 유저 → 401', async () => {
      const userSid = await loginAsUser(app, 'inituser1', 'pass1234');

      await withAuth(supertest(app.getHttpServer()).post(`/booking/init/${eventId}`), userSid).expect(401);
    });
  });
});
