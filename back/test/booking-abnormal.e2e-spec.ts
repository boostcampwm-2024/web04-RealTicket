import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

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
  openEventReservation,
  requestPermission,
  setBookingCount,
  simulateSseDisconnect,
  simulateSseCloseTimeout,
  transitionToSelectingSeat,
  withAuth,
} from './helpers/e2e-setup';

describe('이상 패턴 & 경계 케이스 (booking-abnormal)', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let authService: AuthService;
  let adminSid: string;
  let placeId: number;
  let programId: number;
  let eventId: number;
  let eventId2: number; // ABN-02 전용 두 번째 이벤트

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);
    authService = app.get(AuthService);

    adminSid = await loginAsAdmin(app, 'abnadmin1', 'pass1234');
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
    adminSid = await loginAsAdmin(app, 'abnadmin1', 'pass1234');
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  describe('상태 점프 & 중복 요청 이상 패턴', () => {
    // ABN-01: ENTERING 상태에서 동일 이벤트 permission 재요청
    it('ABN-01: ENTERING 상태에서 중복 permission → 기존 상태 유지', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn01user1', 'pass1234');

      // 1차 permission → ENTERING 진입
      await requestPermission(app, userSid, eventId).expect(200);
      const sessionBefore = await authService.getUserSession(userSid);
      expect(sessionBefore.userStatus).toBe('ENTERING');

      // 2차 permission (중복 요청) → 200 반환 확인
      await requestPermission(app, userSid, eventId).expect(200);

      // 상태 검증: ENTERING 유지 (zadd 멱등 처리 — 동일 sid는 타임스탬프만 갱신)
      // isInsertable 체크 시 entering pool의 sid가 이미 포함되어 있어 슬롯 소모 없이 재진입
      const sessionAfter = await authService.getUserSession(userSid);
      expect(sessionAfter.userStatus).toBe('ENTERING');
      expect(sessionAfter.targetEvent).toBe(eventId);
    });

    // ABN-02: SELECTING_SEAT 중 다른 이벤트 permission — 진단
    it('ABN-02: SELECTING_SEAT 중 다른 이벤트 permission → 실제 동작 고정', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      await openEventReservation(app, adminSid, eventId2).expect(201);
      const userSid = await loginAsUser(app, 'abn02usera', 'pass1234');

      // eventId로 SELECTING_SEAT 진입
      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);
      const beforeSession = await authService.getUserSession(userSid);
      expect(beforeSession.userStatus).toBe('SELECTING_SEAT');

      // 다른 이벤트(eventId2) permission 요청 — 실제 응답 확인
      const res = await requestPermission(app, userSid, eventId2);

      // isAdmission → setUserEventTarget(sid, eventId2) → getForwarded
      // SELECTING_SEAT(3) → USER_LEVEL 비교 없이 isAdmission 레이어에서 처리
      // 실제 동작: 200 반환 + eventId2의 in-booking 풀이 비어 있으므로 ENTERING 진입
      expect(res.status).toBe(200);

      // targetEvent가 eventId2로 덮어쓰여지는지 확인
      const afterSession = await authService.getUserSession(userSid);
      expect(afterSession.targetEvent).toBe(eventId2);

      // userStatus가 ENTERING으로 전이되는지 명시적으로 고정
      // (eventId2 in-booking 풀이 비어 있으므로 isInsertable=true → ENTERING)
      expect(afterSession.userStatus).toBe('ENTERING');
    });

    // ABN-03: setBookingCount 없이 SELECTING_SEAT 진입 후 좌석 점유 → 400
    it('ABN-03: setBookingCount 없이 SELECTING_SEAT 진입 후 좌석 점유 → 400', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn03user1', 'pass1234');

      // permission → ENTERING (setBookingCount 생략)
      await requestPermission(app, userSid, eventId).expect(200);
      // setBookingCount 호출 없음 → entering:${sid}:temp-booking-amount 없음 → getBookingAmount → 0 반환

      // transitionToSelectingSeat: setInBookingFromEntering(sid)
      // → enterBookingService.getBookingAmount(sid) → 0
      // → insertInBooking(eventId, sid, 0) → in-booking 세션 생성 (bookingAmount=0)
      // → setUserStatusSelectingSeat(sid) → SELECTING_SEAT 진입
      await transitionToSelectingSeat(app, userSid);

      const session = await authService.getUserSession(userSid);
      expect(session.userStatus).toBe('SELECTING_SEAT');

      // 좌석 점유 시도 → validateAndAddBookedSeat → bookingAmount(0) <= bookedSeats.length(0) → 400
      const res = await bookSeat(app, userSid, eventId, 0, 0, 'reserved');
      expect(res.status).toBe(400);

      // 에러 후 세션 오염 없음 확인: SELECTING_SEAT 상태 유지
      const sessionAfter = await authService.getUserSession(userSid);
      expect(sessionAfter.userStatus).toBe('SELECTING_SEAT');
    });

    // ABN-04: 예매 완료 후 동일 이벤트 permission 재요청 → 200
    it('ABN-04: 예매 완료 후 동일 이벤트 permission 재요청 → 200 반환', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn04user1', 'pass1234');

      // 예매 완료 흐름
      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      // /reservation으로 예매 저장
      await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSid)
        .send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 0 }] })
        .expect(201);

      // /reservation 성공 후 targetEvent가 유지되는지 확인 (시뮬레이션 전제 조건)
      const sessionAfterReservation = await authService.getUserSession(userSid);
      expect(sessionAfterReservation.targetEvent).toBe(eventId);

      // 예매 완료 후 세션 정리 (in-booking → LOGIN 복귀)
      await simulateSseDisconnect(app, userSid);
      await simulateSseCloseTimeout(app, userSid);

      // 세션 상태 확인: LOGIN
      const sessionAfterCompletion = await authService.getUserSession(userSid);
      expect(sessionAfterCompletion.userStatus).toBe('LOGIN');

      // 동일 이벤트 permission 재요청 → 200 (RESERVED 상태 없음, 재진입 허용)
      const res = await requestPermission(app, userSid, eventId).expect(200);
      expect(res.body.data).toEqual(expect.objectContaining({ enteringStatus: true, waitingStatus: false }));

      // 세션 상태: ENTERING (재진입 성공)
      const sessionAfterReentry = await authService.getUserSession(userSid);
      expect(sessionAfterReentry.userStatus).toBe('ENTERING');
      expect(sessionAfterReentry.targetEvent).toBe(eventId);
    });
  });

  describe('만료 세션 & 잘못된 상태 좌석 조작 이상 패턴', () => {
    // ABN-05: WAITING 상태에서 좌석 점유 → 401
    it('ABN-05: WAITING_QUEUE 상태에서 좌석 점유 시도 → 401', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      // maxSize=1 설정 → user1 슬롯 점유, user2 WAITING 진입
      await withAuth(
        supertest(app.getHttpServer()).post(`/booking/in-booking-pool-size/event/${eventId}`),
        adminSid,
      )
        .send({ maxSize: 1 })
        .expect(201);

      // user1: SELECTING_SEAT (슬롯 점유)
      const user1Sid = await loginAsUser(app, 'abn05user1', 'pass1234');
      await requestPermission(app, user1Sid, eventId).expect(200);
      await setBookingCount(app, user1Sid, 1).expect(201);
      await transitionToSelectingSeat(app, user1Sid);

      // user2: WAITING 진입
      const user2Sid = await loginAsUser(app, 'abn05user2', 'pass1234');
      const waitRes = await requestPermission(app, user2Sid, eventId).expect(200);
      expect(waitRes.body.data.waitingStatus).toBe(true);

      // WAITING 상태(level=1)에서 SELECTING_SEAT 가드(level=3) 통과 불가 → 401
      const res = await bookSeat(app, user2Sid, eventId, 0, 0, 'reserved');
      expect(res.status).toBe(401);
    });

    // ABN-06: 무효 SID로 booking API 호출 → 403
    it('ABN-06: 만료/무효 SID로 booking API 호출 → 403', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn06user1', 'pass1234');

      // 정상 로그인 확인
      await requestPermission(app, userSid, eventId).expect(200);

      // Redis에서 user:{sid} 키 수동 삭제 → 무효 SID 생성
      const redis = getRedisService(app).getOrThrow();
      await redis.del(`user:${userSid}`);

      // 무효 SID로 API 호출 → sessionData=null → ForbiddenException(403)
      const res = await bookSeat(app, userSid, eventId, 0, 0, 'reserved');
      expect(res.status).toBe(403);
    });

    // ABN-07: 이미 취소된 좌석 재취소 → 400
    // 실제 동작: unBookSeat → validateAndRemoveBookedSeat → bookedSeats.length===0 → BadRequestException(400)
    // updateSeatDeleted의 ConflictException(409)은 bookedSeats 검증 이후에 위치하므로 도달하지 않음
    it('ABN-07: 이미 취소된(deleted) 좌석을 다시 취소 → 400', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn07user1', 'pass1234');

      // SELECTING_SEAT 진입
      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);

      // 좌석 점유 → 취소 (정상 흐름)
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);
      await bookSeat(app, userSid, eventId, 0, 0, 'deleted').expect(201);
      // 이 시점에서 좌석 상태: available(bit=1), bookedSeats에서도 제거됨

      // 이미 취소된 좌석 재취소 → validateAndRemoveBookedSeat → bookedSeats 없음 → 400
      const res = await bookSeat(app, userSid, eventId, 0, 0, 'deleted');
      expect(res.status).toBe(400);

      // 에러 후 세션 오염 없음 확인: SELECTING_SEAT 상태 유지
      const sessionAfter = await authService.getUserSession(userSid);
      expect(sessionAfter.userStatus).toBe('SELECTING_SEAT');
    });

    // ABN-08: bookingAmount=1인데 좌석 2개 선택 후 예매 확정 시도 → 400
    it('ABN-08: bookingAmount(1) 초과 좌석 점유 시도 → 400', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn08user1', 'pass1234');

      // SELECTING_SEAT 진입 (bookingAmount=1)
      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);

      // 1번째 좌석 점유 (정상, bookedSeats.length=0 < bookingAmount=1)
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      // 2번째 좌석 점유 시도 → validateAndAddBookedSeat → bookingAmount(1) <= bookedSeats.length(1) → 400
      const res = await bookSeat(app, userSid, eventId, 0, 1, 'reserved');
      expect(res.status).toBe(400);

      // 상태 오염 없음 확인: 기존 점유 좌석(0,0)은 여전히 유지
      const session = await authService.getUserSession(userSid);
      expect(session.userStatus).toBe('SELECTING_SEAT');
    });
  });
});
