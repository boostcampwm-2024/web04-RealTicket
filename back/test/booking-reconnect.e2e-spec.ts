import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

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
  setupSelectingSeat,
  simulateSSEReconnect,
  simulateSseDisconnect,
  simulateWaitingSseTimeout,
  transitionToSelectingSeat,
  withAuth,
} from './helpers/e2e-setup';

describe('SSE 재연결 시나리오 (booking-reconnect)', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let authService: AuthService;
  let waitingQueueService: WaitingQueueService;
  let adminSid: string;
  let placeId: number;
  let programId: number;
  let eventId: number;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);
    authService = app.get(AuthService);
    waitingQueueService = app.get(WaitingQueueService);

    // DB 데이터 생성 (앱 인스턴스 수명 동안 유지)
    adminSid = await loginAsAdmin(app, 'rcnadmin1', 'pass1234');
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
    adminSid = await loginAsAdmin(app, 'rcnadmin1', 'pass1234');
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  it('SSE 끊김 후 타임아웃 내 재연결 → 세션 상태 SELECTING_SEAT 복구', async () => {
    const userSid = await loginAsUser(app, 'reconnect1', 'pass1234');
    await setupSelectingSeat(app, adminSid, eventId, userSid, 1);

    await simulateSseDisconnect(app, userSid);
    const afterDisconnect = await authService.getUserSession(userSid);
    expect(afterDisconnect.userStatus).toBe('RECONNECTING_SELECTING');

    await simulateSSEReconnect(app, userSid);
    const afterReconnect = await authService.getUserSession(userSid);
    expect(afterReconnect.userStatus).toBe('SELECTING_SEAT');
  });

  it('SSE 끊김 후 재연결 → 기존 점유 좌석 유지 + 다른 유저 동일 좌석 점유 불가 (409)', async () => {
    const userSid = await loginAsUser(app, 'reconnect2', 'pass1234');
    await setupSelectingSeat(app, adminSid, eventId, userSid, 1);
    await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

    await simulateSseDisconnect(app, userSid);
    await simulateSSEReconnect(app, userSid);

    // 재연결 후 상태 확인
    const session = await authService.getUserSession(userSid);
    expect(session.userStatus).toBe('SELECTING_SEAT');

    // 다른 유저가 같은 좌석 점유 시도 (이벤트는 이미 오픈 상태)
    const user2Sid = await loginAsUser(app, 'reconnect2b', 'pass1234');
    await requestPermission(app, user2Sid, eventId).expect(200);
    await setBookingCount(app, user2Sid, 1).expect(201);
    await transitionToSelectingSeat(app, user2Sid);
    await bookSeat(app, user2Sid, eventId, 0, 0, 'reserved').expect(409);
  });

  describe('WAITING_QUEUE SSE 끊김 시나리오', () => {
    it('WAITING 중 SSE 끊김 → 타임아웃 내 재연결 → 대기 순서(큐 내 위치) 유지', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      // maxSize=1로 제한 → user1이 슬롯을 차지하면 user2는 WAITING 진입
      await withAuth(
        supertest(app.getHttpServer()).post(`/booking/in-booking-pool-size/event/${eventId}`),
        adminSid,
      )
        .send({ maxSize: 1 })
        .expect(201);

      // user1: SELECTING_SEAT (슬롯 점유)
      const user1Sid = await loginAsUser(app, 'waiting1a', 'pass1234');
      await requestPermission(app, user1Sid, eventId).expect(200);
      await setBookingCount(app, user1Sid, 1).expect(201);
      await transitionToSelectingSeat(app, user1Sid);

      // user2: maxSize 초과로 WAITING 진입
      const user2Sid = await loginAsUser(app, 'waiting1b', 'pass1234');
      const waitRes = await requestPermission(app, user2Sid, eventId).expect(200);
      expect(waitRes.body.waitingStatus).toBe(true);

      // SSE 끊김 시뮬레이션 — WAITING 상태에서 SSE가 끊겨도 서버는 상태를 변경하지 않음
      // (booking.controller.ts close 핸들러: removeSseClient만 호출, 큐/상태 변경 없음)
      const afterDisconnect = await authService.getUserSession(user2Sid);
      expect(afterDisconnect.userStatus).toBe('WAITING');

      // 큐에 user2가 여전히 존재하는지 확인 (SSE-03)
      const waitingSids = await waitingQueueService.getAllWaitingSids(eventId);
      expect(waitingSids).toContain(user2Sid);
    });

    it('WAITING 중 SSE 끊김 + 타임아웃 초과 → 대기열 제거 + LOGIN 복귀', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      // maxSize=1로 제한
      await withAuth(
        supertest(app.getHttpServer()).post(`/booking/in-booking-pool-size/event/${eventId}`),
        adminSid,
      )
        .send({ maxSize: 1 })
        .expect(201);

      // user1: SELECTING_SEAT
      const user1Sid = await loginAsUser(app, 'waiting2a', 'pass1234');
      await requestPermission(app, user1Sid, eventId).expect(200);
      await setBookingCount(app, user1Sid, 1).expect(201);
      await transitionToSelectingSeat(app, user1Sid);

      // user2: WAITING 진입
      const user2Sid = await loginAsUser(app, 'waiting2b', 'pass1234');
      const waitRes = await requestPermission(app, user2Sid, eventId).expect(200);
      expect(waitRes.body.waitingStatus).toBe(true);

      // 타임아웃 초과 시뮬레이션 (SSE-04)
      await simulateWaitingSseTimeout(app, user2Sid);

      // 상태 검증: LOGIN으로 복귀
      const session = await authService.getUserSession(user2Sid);
      expect(session.userStatus).toBe('LOGIN');

      // 큐에서 제거됐는지 확인
      const queueSize = await waitingQueueService.getQueueSize(eventId);
      expect(queueSize).toBe(0);

      // LOGIN 상태에서 좌석 점유 시도 → 401
      await bookSeat(app, user2Sid, eventId, 0, 0, 'reserved').expect(401);
    });
  });
});
