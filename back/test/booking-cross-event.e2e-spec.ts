import { INestApplication } from '@nestjs/common';

import { AuthService } from 'src/auth/service/auth.service';
import { WaitingQueueService } from 'src/domains/booking/service/waiting-queue.service';
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
  simulateSseCloseTimeout,
  simulateSseDisconnect,
  simulateWaitingSseTimeout,
  transitionToSelectingSeat,
  withAuth,
} from './helpers/e2e-setup';
import supertest from 'supertest';

describe('크로스-이벤트 격리 (booking-cross-event)', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let authService: AuthService;
  let waitingQueueService: WaitingQueueService;
  let adminSid: string;
  let placeId: number;
  let programId: number;
  let eventId: number;   // 이벤트 A
  let eventId2: number;  // 이벤트 B

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);
    authService = app.get(AuthService);
    waitingQueueService = app.get(WaitingQueueService);

    adminSid = await loginAsAdmin(app, 'crosadmin1', 'pass1234');
    placeId = await createPlace(app, adminSid);
    await createSections(app, adminSid, placeId, [
      { name: 'A', colLen: 3, seats: [1, 1, 1, 1, 1, 1], order: 0 },
    ]);
    programId = await createProgram(app, adminSid, placeId);
    eventId = await createEvent(app, adminSid, programId, {
      reservationOpenDate: new Date(Date.now() - 86400000).toISOString(),
    });
    eventId2 = await createEvent(app, adminSid, programId, {
      reservationOpenDate: new Date(Date.now() - 86400000).toISOString(),
    });
  });

  beforeEach(async () => {
    await redisService.flushAll();
    adminSid = await loginAsAdmin(app, 'crosadmin1', 'pass1234');
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  describe('이벤트 A 예매 완료 → 이벤트 B 간섭 없음', () => {
    it('ISO-03: 이벤트 A 예매 완료 후 이벤트 B permission → 200 반환', async () => {
      // 이벤트 A: userA 예매 완료 흐름
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userASid = await loginAsUser(app, 'iso03usera', 'pass1234');
      await requestPermission(app, userASid, eventId).expect(200);
      await setBookingCount(app, userASid, 1).expect(201);
      await transitionToSelectingSeat(app, userASid);

      // 좌석 점유 + 예매 저장
      await bookSeat(app, userASid, eventId, 0, 0, 'reserved').expect(201);
      await withAuth(
        supertest(app.getHttpServer()).post('/reservation'),
        userASid,
      ).send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 0 }] }).expect(201);

      // 이벤트 A 세션 정리 — SSE close 시뮬레이션으로 in-booking 세션 회수
      await simulateSseDisconnect(app, userASid);
      await simulateSseCloseTimeout(app, userASid);

      // 이벤트 B 오픈 + permission 요청 → 200 (ISO-03)
      await openEventReservation(app, adminSid, eventId2).expect(201);
      const res = await requestPermission(app, userASid, eventId2).expect(200);
      expect(res.body).toEqual(
        expect.objectContaining({ enteringStatus: true, waitingStatus: false }),
      );
    });

    it('ISO-04: 이벤트 A 예매 완료 후 이벤트 B SELECTING_SEAT 진입 정상 동작', async () => {
      // 이벤트 A: userA 예매 완료
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userASid = await loginAsUser(app, 'iso04usera', 'pass1234');
      await requestPermission(app, userASid, eventId).expect(200);
      await setBookingCount(app, userASid, 1).expect(201);
      await transitionToSelectingSeat(app, userASid);
      await bookSeat(app, userASid, eventId, 0, 0, 'reserved').expect(201);
      await withAuth(
        supertest(app.getHttpServer()).post('/reservation'),
        userASid,
      ).send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 0 }] }).expect(201);

      // 이벤트 A in-booking 세션 정리
      await simulateSseDisconnect(app, userASid);
      await simulateSseCloseTimeout(app, userASid);

      // 이벤트 B: permission → ENTERING → setBookingCount → SELECTING_SEAT
      await openEventReservation(app, adminSid, eventId2).expect(201);
      await requestPermission(app, userASid, eventId2).expect(200);
      await setBookingCount(app, userASid, 1).expect(201);
      await transitionToSelectingSeat(app, userASid);

      // 세션 상태 검증 (ISO-04)
      const session = await authService.getUserSession(userASid);
      expect(session.userStatus).toBe('SELECTING_SEAT');
      expect(session.targetEvent).toBe(eventId2);
    });
  });

  describe('이벤트 A WAITING 이탈 → 이벤트 B 간섭 없음', () => {
    it('ISO-01: 이벤트 A WAITING 타임아웃 후 이벤트 B permission → 200 반환', async () => {
      // 이벤트 A 오픈 + maxSize=1로 2번째 유저를 WAITING 진입시킴
      await openEventReservation(app, adminSid, eventId).expect(201);
      await withAuth(
        supertest(app.getHttpServer()).post(`/booking/in-booking-pool-size/event/${eventId}`),
        adminSid,
      ).send({ maxSize: 1 }).expect(201);

      // user1: 슬롯 점유 (ENTERING → SELECTING_SEAT)
      const user1Sid = await loginAsUser(app, 'iso01user1', 'pass1234');
      await requestPermission(app, user1Sid, eventId).expect(200);
      await setBookingCount(app, user1Sid, 1).expect(201);
      await transitionToSelectingSeat(app, user1Sid);

      // user2: WAITING 진입
      const userSid = await loginAsUser(app, 'iso01user2', 'pass1234');
      const waitRes = await requestPermission(app, userSid, eventId).expect(200);
      expect(waitRes.body.waitingStatus).toBe(true);

      // 이벤트 A WAITING 타임아웃 시뮬레이션 → LOGIN 복귀
      await simulateWaitingSseTimeout(app, userSid);
      const sessionAfterTimeout = await authService.getUserSession(userSid);
      expect(sessionAfterTimeout.userStatus).toBe('LOGIN');

      // 이벤트 B 오픈 후 permission 요청 → 200 반환 (ISO-01)
      await openEventReservation(app, adminSid, eventId2).expect(201);
      const res = await requestPermission(app, userSid, eventId2).expect(200);
      expect(res.body).toEqual(
        expect.objectContaining({ enteringStatus: true, waitingStatus: false }),
      );
    });

    it('ISO-02: 이벤트 A WAITING 타임아웃 후 이벤트 B 세션 상태 변화 없음 + 이벤트 A 큐 0', async () => {
      // 이벤트 A 오픈 + maxSize=1
      await openEventReservation(app, adminSid, eventId).expect(201);
      await withAuth(
        supertest(app.getHttpServer()).post(`/booking/in-booking-pool-size/event/${eventId}`),
        adminSid,
      ).send({ maxSize: 1 }).expect(201);

      // user1: 슬롯 점유
      const user1Sid = await loginAsUser(app, 'iso02user1', 'pass1234');
      await requestPermission(app, user1Sid, eventId).expect(200);
      await setBookingCount(app, user1Sid, 1).expect(201);
      await transitionToSelectingSeat(app, user1Sid);

      // userA: 이벤트 A WAITING 진입
      const userASid = await loginAsUser(app, 'iso02usera', 'pass1234');
      const waitRes = await requestPermission(app, userASid, eventId).expect(200);
      expect(waitRes.body.waitingStatus).toBe(true);

      // 이벤트 B 오픈 후 별도 유저(userB)가 ENTERING 진입
      await openEventReservation(app, adminSid, eventId2).expect(201);
      const userBSid = await loginAsUser(app, 'iso02userb', 'pass1234');
      await requestPermission(app, userBSid, eventId2).expect(200);
      // userB 상태: ENTERING
      const userBBefore = await authService.getUserSession(userBSid);
      expect(userBBefore.userStatus).toBe('ENTERING');

      // 이벤트 A 타임아웃 정리 → userA = LOGIN
      await simulateWaitingSseTimeout(app, userASid);

      // 이벤트 A 큐 크기 = 0 (ISO-02: A 정리가 완료됨)
      const queueSizeA = await waitingQueueService.getQueueSize(eventId);
      expect(queueSizeA).toBe(0);

      // userB의 이벤트 B 세션 상태 변화 없음 (ISO-02: B에 영향 없음)
      const userBAfter = await authService.getUserSession(userBSid);
      expect(userBAfter.userStatus).toBe('ENTERING');
      expect(userBAfter.targetEvent).toBe(eventId2);
    });
  });
});
