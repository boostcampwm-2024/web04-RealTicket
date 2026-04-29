import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

import { InBookingService } from 'src/domains/booking/service/in-booking.service';
import { TestRedisService } from 'src/testing/redis/test-redis.service';

import {
  bookSeat,
  cleanupReservedSeats,
  createEvent,
  createPlace,
  createProgram,
  createSections,
  createTestApp,
  getRedisService,
  loginAsAdmin,
  loginAsUser,
  setupSelectingSeat,
  simulateSseDisconnectWithSection,
  simulateSSEReconnectWithSection,
  switchSection,
  withAuth,
} from './helpers/e2e-setup';

describe('Phase 2: 섹션 전환 엔드포인트 + 재연결 복원', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let adminSid: string;
  let userSid: string;
  let eventId: number;
  let inBookingService: InBookingService;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);
    inBookingService = app.get(InBookingService);

    adminSid = await loginAsAdmin(app, 'sectadmin1', 'pass1234');

    const placeId = await createPlace(app, adminSid);
    // 2개 섹션 생성 (sectionIndex 0, 1)
    await createSections(app, adminSid, placeId, [
      { name: 'A구역', colLen: 3, seats: [1, 1, 1, 1, 1, 1], order: 0 },
      { name: 'B구역', colLen: 3, seats: [1, 1, 1, 1, 1, 1], order: 1 },
    ]);
    const programId = await createProgram(app, adminSid, placeId);
    eventId = await createEvent(app, adminSid, programId, {
      reservationOpenDate: new Date(Date.now() - 86400000).toISOString(),
    });
  });

  beforeEach(async () => {
    await redisService.flushAll();
    await cleanupReservedSeats(app, eventId);
    adminSid = await loginAsAdmin(app, 'sectadmin1', 'pass1234');
    userSid = await loginAsUser(app, 'sectionuser1', 'pass1234');
    await setupSelectingSeat(app, adminSid, eventId, userSid, 1, 0);
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  // ─── SSE-02: 최초 연결 시 subscribedSection null ───

  it('SSE-02: insertInBooking으로 생성된 세션의 subscribedSection이 null이다', async () => {
    // insertInBooking은 subscribedSection: null로 초기화한다
    const freshSid = await loginAsUser(app, 'sse02user', 'pass1234');
    await inBookingService.insertInBooking(eventId, freshSid);
    const session = await inBookingService.getSession(eventId, freshSid);
    expect(session).not.toBeNull();
    expect(session!.subscribedSection).toBeNull();
  });

  // ─── API-01, SSE-03, SSE-05: PATCH 섹션 전환 ───

  it('API-01/SSE-05: PATCH /booking/seat/section → 200 + sectionIndex 포함', async () => {
    const res = await switchSection(app, userSid, 0).expect(200);
    expect(res.body.data).toHaveProperty('sectionIndex', 0);
    // seatStatus는 ioredis-mock의 Lua eval 지원 여부에 따라 없을 수 있음
    if (res.body.data.seatStatus !== undefined) {
      expect(Array.isArray(res.body.data.seatStatus)).toBe(true);
    }
  });

  it('API-01 (세션 갱신): PATCH 성공 후 subscribedSection이 요청한 섹션 번호로 갱신된다', async () => {
    await switchSection(app, userSid, 1).expect(200);
    const session = await inBookingService.getSession(eventId, userSid);
    expect(session!.subscribedSection).toBe(1);
  });

  it('SSE-03 (idempotent): 같은 sectionIndex로 PATCH 두 번 → 두 번 모두 200', async () => {
    await switchSection(app, userSid, 0).expect(200);
    await switchSection(app, userSid, 0).expect(200);
  });

  // ─── API-02: 상태 검증 ───

  it('API-02: 미인증 요청(쿠키 없음) → 403 FORBIDDEN', async () => {
    // SessionAuthGuard는 세션 없을 때 AuthErrorCode.FORBIDDEN(403)을 반환한다
    const guestRes = await supertest(app.getHttpServer())
      .patch('/booking/seat/section')
      .send({ sectionIndex: 0 });
    expect(guestRes.status).toBe(403);
  });

  // ─── VAL-01: bookSeat 섹션 검증 ───

  it('VAL-01: 구독 섹션(0)과 다른 sectionIndex(1)로 bookSeat → 403 BOOKING_SEAT_UNAUTHORIZED_SECTION', async () => {
    await switchSection(app, userSid, 0).expect(200);
    const res = await bookSeat(app, userSid, eventId, 1, 0, 'reserved');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BOOKING_SEAT_UNAUTHORIZED_SECTION');
  });

  // FIXME(02-04): D-08 도입 후 권한의 본질이 SSE 풀 소속(isSidInPool)으로 바뀌었다.
  // setupSelectingSeat이 broadcaster 풀에 sid를 등록하므로 subscribedSection을 null로
  // 강제 변경해도 풀 소속은 유지된다 → bookSeat 200. 정식 시나리오는 02-04 GET-based로 갱신.
  it.skip('VAL-01: 섹션 미선택 상태(subscribedSection null)에서 bookSeat → 403 BOOKING_SEAT_UNAUTHORIZED_SECTION', async () => {
    // 별도 유저 생성 후 subscribedSection을 null로 직접 세팅
    const nulluser = await loginAsUser(app, 'val01null', 'pass1234');
    await setupSelectingSeat(app, adminSid, eventId, nulluser, 1, 0);
    // subscribedSection을 강제로 null로 변경
    const session = await inBookingService.getSession(eventId, nulluser);
    session!.subscribedSection = null;
    await inBookingService.setSession(eventId, session!);

    const res = await bookSeat(app, nulluser, eventId, 0, 0, 'reserved');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BOOKING_SEAT_UNAUTHORIZED_SECTION');
  });

  // ─── VAL-02: unBookSeat 섹션 검증 ───

  it('VAL-02: 구독 섹션(0)과 다른 sectionIndex(1)로 unBookSeat → 403 BOOKING_SEAT_UNAUTHORIZED_SECTION', async () => {
    await switchSection(app, userSid, 0).expect(200);
    const res = await withAuth(supertest(app.getHttpServer()).post('/booking'), userSid).send({
      eventId,
      sectionIndex: 1,
      seatIndex: 0,
      expectedStatus: 'deleted',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BOOKING_SEAT_UNAUTHORIZED_SECTION');
  });

  // ─── SSE-06: 연결 해제 시 subscribedSection 보존 ───

  it('SSE-06: SSE 연결 해제 후 subscribedSection이 보존된다', async () => {
    await switchSection(app, userSid, 0).expect(200);
    const before = await inBookingService.getSession(eventId, userSid);
    expect(before!.subscribedSection).toBe(0);

    await simulateSseDisconnectWithSection(app, userSid);

    const after = await inBookingService.getSession(eventId, userSid);
    // subscribedSection은 InBookingSession 내부 필드이므로 RECONNECTING_SELECTING 중에도 보존
    expect(after!.subscribedSection).toBe(0);

    // 테스트 후 상태 복원
    await simulateSSEReconnectWithSection(app, userSid);
  });

  // ─── SSE-07: 재연결 후 subscribedSection 복원 ───

  it('SSE-07: 재연결 후 subscribedSection이 이전 섹션으로 복원된다', async () => {
    await switchSection(app, userSid, 0).expect(200);

    await simulateSseDisconnectWithSection(app, userSid);
    await simulateSSEReconnectWithSection(app, userSid);

    // 재연결 후 세션의 subscribedSection이 보존돼 있어야 한다
    const session = await inBookingService.getSession(eventId, userSid);
    expect(session!.subscribedSection).toBe(0);
  });
});
