import { INestApplication } from '@nestjs/common';

import { AuthService } from 'src/auth/service/auth.service';
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
  requestPermission,
  setBookingCount,
  setupSelectingSeat,
  simulateSSEReconnect,
  simulateSseDisconnect,
  transitionToSelectingSeat,
} from './helpers/e2e-setup';

describe('SSE 재연결 시나리오 (booking-reconnect)', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let authService: AuthService;
  let adminSid: string;
  let placeId: number;
  let programId: number;
  let eventId: number;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);
    authService = app.get(AuthService);

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
});
