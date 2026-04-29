import { INestApplication } from '@nestjs/common';

import { BookingService } from 'src/domains/booking/service/booking.service';
import { InBookingService } from 'src/domains/booking/service/in-booking.service';
import { TestRedisService } from 'src/testing/redis/test-redis.service';

import {
  addSseClientToSectionDirect,
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
  openEventReservation,
  requestPermission,
  setBookingCount,
  setupSelectingSeat,
} from './helpers/e2e-setup';

describe('Phase 2 (A안): GET ?section=N 기반 풀 등록 + isSidInPool 권한 검증', () => {
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

  // ─── SSE-08·SSE-09: addSseClientToSectionDirect 헬퍼 동작 검증 ───

  it('SSE-08: addSseClientToSectionDirect 호출은 양수 seq를 반환한다 (풀 등록 성공)', async () => {
    // 섹션 1로 추가 등록 → seq 반환값이 양수여야 함
    const { seq } = await addSseClientToSectionDirect(app, userSid, 1);
    expect(seq).toBeGreaterThan(0);
  });

  it('SSE-09: addSseClientToSectionDirect 호출 후 해당 섹션으로 bookSeat → 201 (풀 소속 확인)', async () => {
    // 섹션 1로 풀 등록 후 섹션 1 bookSeat → isSidInPool true → 201
    await addSseClientToSectionDirect(app, userSid, 1);
    const res = await bookSeat(app, userSid, eventId, 1, 0, 'reserved');
    expect(res.status).toBe(201);
  });

  // ─── SSE-10: D-02 invariant — addSseClientToSection이 subscribedSection 갱신 ───

  it('SSE-10: addSseClientToSectionDirect 호출이 session.subscribedSection을 갱신한다', async () => {
    // 섹션 1로 풀 등록 → subscribedSection이 1로 갱신되어야 함
    await addSseClientToSectionDirect(app, userSid, 1);
    const session = await inBookingService.getSession(eventId, userSid);
    expect(session?.subscribedSection).toBe(1);
  });

  // ─── VAL-01: bookSeat 섹션 검증 ───

  it('VAL-01: 풀에 등록된 섹션(0)과 다른 sectionIndex(1)로 bookSeat → 403 BOOKING_SEAT_UNAUTHORIZED_SECTION', async () => {
    // beforeEach에서 setupSelectingSeat이 섹션 0에 userSid 등록
    // 섹션 1로 bookSeat 시도 → 풀 소속 아님 → 403
    const res = await bookSeat(app, userSid, eventId, 1, 0, 'reserved');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BOOKING_SEAT_UNAUTHORIZED_SECTION');
  });

  it('VAL-01 (풀 미등록): 어떤 섹션 풀에도 없는 sid로 bookSeat → 403 BOOKING_SEAT_UNAUTHORIZED_SECTION', async () => {
    // 별도 유저를 SELECTING_SEAT 상태까지 올리되 풀 등록은 생략
    // openEventReservation → requestPermission → setBookingCount → setInBookingFromEntering (풀 등록 없음)
    const unregisteredSid = await loginAsUser(app, 'val01nopool', 'pass1234');
    await openEventReservation(app, adminSid, eventId).expect(201);
    await requestPermission(app, unregisteredSid, eventId).expect(200);
    await setBookingCount(app, unregisteredSid, 1).expect(201);
    // addSseClientToSection 없이 상태만 SELECTING_SEAT으로 전환 (풀 미등록 상태 유지)
    const bookingService = app.get(BookingService);
    await bookingService.setInBookingFromEntering(unregisteredSid);

    const res = await bookSeat(app, unregisteredSid, eventId, 0, 0, 'reserved');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BOOKING_SEAT_UNAUTHORIZED_SECTION');
  });

  // ─── VAL-02: unBookSeat 섹션 검증 ───

  it('VAL-02: 풀에 등록된 섹션(0)과 다른 sectionIndex(1)로 unBookSeat → 403 BOOKING_SEAT_UNAUTHORIZED_SECTION', async () => {
    // beforeEach에서 섹션 0 등록 → 섹션 1로 unBookSeat 시도 → 403
    const res = await bookSeat(app, userSid, eventId, 1, 0, 'deleted');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('BOOKING_SEAT_UNAUTHORIZED_SECTION');
  });

  // ─── VAL-03: 올바른 섹션 풀 등록 후 bookSeat positive case ───

  it('VAL-03: 올바른 섹션(0) 풀에 등록된 sid로 bookSeat(섹션 0) → 201', async () => {
    // beforeEach에서 이미 섹션 0 풀 등록됨 → 같은 섹션 bookSeat → 201
    const res = await bookSeat(app, userSid, eventId, 0, 0, 'reserved');
    expect(res.status).toBe(201);
  });
});
