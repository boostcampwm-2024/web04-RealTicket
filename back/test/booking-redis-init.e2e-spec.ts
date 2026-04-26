import { INestApplication } from '@nestjs/common';

import { AppException } from 'src/common/exception/app.exception';
import { BookingSeatsService } from 'src/domains/booking/service/booking-seats.service';
import { OpenBookingService } from 'src/domains/booking/service/open-booking.service';
import { EventRepository } from 'src/domains/event/repository/event.reposiotry';
import { ReservationRepository } from 'src/domains/reservation/repository/reservation.repository';
import { ReservedSeatRepository } from 'src/domains/reservation/repository/reservedSeat.repository';
import { UserRepository } from 'src/domains/user/repository/user.repository';
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
  setupSelectingSeat,
} from './helpers/e2e-setup';

describe('Phase 2: BE Redis 초기화 기예매 반영', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let adminSid: string;
  let placeId: number;
  let programId: number;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);
    adminSid = await loginAsAdmin(app, 'bradmin1', 'pass1234');
    placeId = await createPlace(app, adminSid);
    await createSections(app, adminSid, placeId, [
      { name: 'A', colLen: 3, seats: [1, 1, 1, 1, 1, 1], order: 0 },
    ]);
    programId = await createProgram(app, adminSid, placeId);
  });

  beforeEach(async () => {
    await redisService.flushAll();
    adminSid = await loginAsAdmin(app, 'bradmin1', 'pass1234');
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  it('BE-01: ReservedSeat이 DB에 사전 존재하면 init 후 해당 좌석은 SEAT_ALREADY_RESERVED', async () => {
    // ── 1) Event 생성 ──────────────────────────────────────────────
    const eventId = await createEvent(app, adminSid, programId, {
      reservationOpenDate: new Date(Date.now() - 86_400_000).toISOString(),
    });

    // ── 2) 사전 주입에 사용할 user 준비 (loginAsUser → UserRepository로 user.id 조회) ──
    const targetLoginId = 'be01user1';
    await loginAsUser(app, targetLoginId, 'pass1234'); // signup-or-login

    const userRepo = app.get(UserRepository);
    const user = await userRepo.findByLoginId(targetLoginId);
    expect(user).toBeTruthy();
    const userId = user!.id;

    // ── 3) Reservation + ReservedSeat 사전 주입 ────────────────────
    // 좌석: section 'A' (sectionIndex 0), row=1 col=1 → seatIndex = (1-1)*3 + (1-1) = 0
    const reservationRepo = app.get(ReservationRepository);
    const reservedSeatRepo = app.get(ReservedSeatRepository);

    const reservation = await reservationRepo.storeReservation({
      createdAt: new Date(),
      amount: 1,
      program: { id: programId },
      event: { id: eventId },
      user: { id: userId },
    });
    const reservationId = (reservation as unknown as { id: number }).id;
    expect(reservationId).toBeGreaterThan(0);

    await reservedSeatRepo.storeReservedSeat([
      {
        event: { id: eventId },
        sectionName: 'A',
        sectionIndex: 0,
        colLen: 3,
        row: 1,
        col: 1,
        reservation: { id: reservationId },
      },
    ]);

    // ── 4) initReservation 트리거 (closeReservationAnyway → openReservationById) ──
    // openReservationById: SETNX 점유 + ReservedSeat 조회 + 비트맵에 0 반영
    const openSvc = app.get(OpenBookingService);
    await openSvc.initReservation(eventId);

    // ── 5) 새 유저로 SELECTING_SEAT 진입 + 동일 좌석 bookSeat 시도 ──
    // setupSelectingSeat 내부의 openEventReservation이 또 init 트리거함
    // → initReservation = closeReservationAnyway(unlinkOpenedEvent) + openReservationById
    // → unlinkOpenedEvent로 SETNX 키 삭제 후 다시 SETNX 성공 → ReservedSeat 재반영
    // 따라서 좌석 (sectionIndex=0, seatIndex=0)은 여전히 0(예약됨) 상태 유지
    const user2Sid = await loginAsUser(app, 'be01user2', 'pass1234');
    await setupSelectingSeat(app, adminSid, eventId, user2Sid, 1, 0);

    const res = await bookSeat(app, user2Sid, eventId, 0, 0, 'reserved');

    // ── 6) HTTP 409 + errorCode 'BOOKING_SEAT_ALREADY_RESERVED' 검증 ─
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BOOKING_SEAT_ALREADY_RESERVED');
  });

  it('BE-02: opened 키가 점유된 상태에서 openReservation 재호출 시 attach 분기 진입 + 데이터 보존', async () => {
    // ── 1) Event 생성 ──────────────────────────────────────────────
    const eventId = await createEvent(app, adminSid, programId, {
      reservationOpenDate: new Date(Date.now() - 86_400_000).toISOString(),
    });

    // ── 2) 1차 init + 임의 좌석 점유 ───────────────────────────────
    // setupSelectingSeat 내부의 openEventReservation이 첫 init을 트리거 → SETNX 키 'true' SET
    const userSid = await loginAsUser(app, 'be02user1', 'pass1234');
    await setupSelectingSeat(app, adminSid, eventId, userSid, 1, 0);

    // 좌석 (sectionIndex=0, seatIndex=1) 점유 → Redis 비트맵 변경
    const bookRes = await bookSeat(app, userSid, eventId, 0, 1, 'reserved');
    expect(bookRes.status).toBe(201);

    // 1차 init 후 SETNX 키가 'true'로 SET된 상태 검증
    const redis = redisService.getOrThrow();
    const openedBefore = await redis.get(`open-booking:${eventId}:opened`);
    expect(openedBefore).toBe('true');

    // ── 3) BookingSeatsService spy 설치 (보조 검증용) ──────────────
    // 두 번째 openReservation 호출 시 attach 분기만 호출되고 full init은 호출되지 않아야 함.
    const openSvc = app.get(OpenBookingService);
    const seatsSvc = (openSvc as unknown as { seatsUpdateService: BookingSeatsService }).seatsUpdateService;

    const fullInitSpy = jest.spyOn(seatsSvc, 'openReservation');
    const attachSpy = jest.spyOn(seatsSvc, 'attachSubscriptionsForExistingEvent');

    // ── 4) 두 번째 인스턴스의 openReservation 시도 시뮬레이션 ──────
    // initReservation은 unlinkOpenedEvent로 SETNX 키를 지우므로 BE-02 분기를 못 탐.
    // → private openReservation을 (svc as any) 캐스팅으로 직접 호출.
    // 이 경로는 unlink 없이 SETNX 게이트만 거치므로 두 번째 호출은 attach 분기 진입.
    const eventRepo = app.get(EventRepository);
    const event = await eventRepo.selectEvent(eventId);
    await (openSvc as any).openReservation(event);

    // ── 5) spy 검증: attach만 호출되고 full init은 호출되지 않음 ────
    expect(attachSpy).toHaveBeenCalledTimes(1);
    expect(attachSpy).toHaveBeenCalledWith(eventId, expect.any(Number));
    expect(fullInitSpy).not.toHaveBeenCalled();

    // ── 6) 데이터 보존 검증 ────────────────────────────────────────
    // 첫 init 시점에 점유된 좌석 (sectionIndex=0, seatIndex=1)이 여전히 0(예약됨) 상태인지 확인.
    // attach 분기는 Redis 데이터를 변경하지 않으므로 비트맵이 그대로 보존돼야 한다.
    let caughtError: unknown;
    try {
      await seatsSvc.updateSeatReserved(eventId, [0, 1]);
    } catch (err) {
      caughtError = err;
    }
    expect(caughtError).toBeInstanceOf(AppException);
    expect((caughtError as AppException).getCode()).toBe('BOOKING_SEAT_ALREADY_RESERVED');

    // ── 7) 점유되지 않은 좌석은 여전히 가용 ───────────────────────
    // 비트맵 데이터가 보존됐다는 증거 — 다른 자리에 RESERVE 시도가 정상 성공.
    const otherSeatRes = await seatsSvc.updateSeatReserved(eventId, [0, 0]);
    expect(otherSeatRes.acceptedStatus).toBeDefined();

    // spy 정리
    fullInitSpy.mockRestore();
    attachSpy.mockRestore();
  });
});
