import http from 'http';

import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

import { AuthService } from 'src/auth/service/auth.service';
import { SEATS_BROADCAST_INTERVAL } from 'src/domains/booking/const/seatsBroadcastInterval.const';
import { BookingSeatsService } from 'src/domains/booking/service/booking-seats.service';
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
  openEventReservation,
  requestPermission,
  setBookingCount,
  setupSelectingSeat,
  simulateSseCloseTimeout,
  simulateSseDisconnect,
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
    await cleanupReservedSeats(app, eventId);
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
      expect(res.body.data.now).toBeGreaterThanOrEqual(before);
      expect(res.body.data.now).toBeLessThanOrEqual(after);
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

      expect(res.body.data).toEqual(
        expect.objectContaining({
          enteringStatus: true,
          waitingStatus: false,
        }),
      );
    });

    it('예약이 오픈되지 않은 이벤트 → 400', async () => {
      // Redis flushed 상태, 이벤트 미오픈
      const userSid = await loginAsUser(app, 'permuser2', 'pass1234');

      const bErrRes1 = await requestPermission(app, userSid, eventId).expect(400);
      expect(bErrRes1.body.success).toBe(false);
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

      expect(res.body.data.waitingStatus).toBe(true);
      expect(res.body.data.userOrder).toBeDefined();
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

      expect(res.body.data.bookingAmount).toBe(2);
    });

    it('범위 밖 인원(0, 5) → 400', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'cntuser2', 'pass1234');
      await requestPermission(app, userSid, eventId).expect(200);

      const bErrRes2 = await setBookingCount(app, userSid, 0).expect(400);
      expect(bErrRes2.body.success).toBe(false);
      const bErrRes3 = await setBookingCount(app, userSid, 5).expect(400);
      expect(bErrRes3.body.success).toBe(false);
    });

    it('LOGIN 상태에서 → 401', async () => {
      const userSid = await loginAsUser(app, 'cntuser3', 'pass1234');

      const bErrRes4 = await setBookingCount(app, userSid, 1).expect(401);
      expect(bErrRes4.body.success).toBe(false);
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

      expect(res.body.data).toEqual(
        expect.objectContaining({
          sectionIndex: 0,
          seatIndex: 0,
          acceptedStatus: 'reserved',
        }),
      );
    });

    it('이미 점유된 좌석 재점유 → 409 Conflict', async () => {
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      const bErrRes5 = await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(409);
      expect(bErrRes5.body.success).toBe(false);
    });

    it('좌석 취소 → 성공', async () => {
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      const res = await bookSeat(app, userSid, eventId, 0, 0, 'deleted').expect(201);

      expect(res.body.data.acceptedStatus).toBe('deleted');
    });

    it('예매 수량 초과 → 400', async () => {
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);
      await bookSeat(app, userSid, eventId, 0, 1, 'reserved').expect(201);

      // bookingAmount=2인데 3번째 좌석 점유 시도
      const bErrRes6 = await bookSeat(app, userSid, eventId, 0, 2, 'reserved').expect(400);
      expect(bErrRes6.body.success).toBe(false);
    });

    it('LOGIN 상태에서 좌석 점유 → 401', async () => {
      const loginOnlySid = await loginAsUser(app, 'seatusr2', 'pass1234');

      const bErrRes7 = await bookSeat(app, loginOnlySid, eventId, 0, 0, 'reserved').expect(401);
      expect(bErrRes7.body.success).toBe(false);
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

      expect(res.body.data.maxSize).toBe(50);
    });

    it('전체 이벤트 maxSize 설정', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      const res = await withAuth(
        supertest(app.getHttpServer()).post('/booking/in-booking-pool-size/all'),
        adminSid,
      )
        .send({ maxSize: 100 })
        .expect(201);

      expect(res.body.data.maxSize).toBe(100);
    });

    it('기본값 maxSize 설정', async () => {
      const res = await withAuth(
        supertest(app.getHttpServer()).post('/booking/in-booking-pool-size/default'),
        adminSid,
      )
        .send({ maxSize: 200 })
        .expect(201);

      expect(res.body.data.maxSize).toBe(200);
    });

    it('일반 유저 → 401', async () => {
      const userSid = await loginAsUser(app, 'pooluser1', 'pass1234');

      const bErrRes8 = await withAuth(
        supertest(app.getHttpServer()).post('/booking/in-booking-pool-size/default'),
        userSid,
      )
        .send({ maxSize: 100 })
        .expect(401);
      expect(bErrRes8.body.success).toBe(false);
    });
  });

  // ─── SSE 연결 해제 ───

  describe('SSE 연결 해제 시나리오', () => {
    it('예매 확정 후 SSE 해제 → 좌석 회수되지 않음 (saved=true)', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'sseuser1', 'pass1234');
      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      // 예매 확정 → saved=true
      await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSid)
        .send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 0 }] })
        .expect(201);

      // SSE 해제 1차: 상태 → RECONNECTING_SELECTING
      await simulateSseDisconnect(app, userSid);

      const authService = app.get(AuthService);
      const session = await authService.getUserSession(userSid);
      expect(session.userStatus).toBe('RECONNECTING_SELECTING');

      // SSE 해제 2차: 타임아웃 만료 → 정리
      await simulateSseCloseTimeout(app, userSid);

      // 좌석이 여전히 점유 상태인지 확인 — 이벤트 재초기화 없이 다른 유저가 같은 좌석 점유 시도
      const user2Sid = await loginAsUser(app, 'sseuser2', 'pass1234');
      await requestPermission(app, user2Sid, eventId).expect(200);
      await setBookingCount(app, user2Sid, 1).expect(201);
      await transitionToSelectingSeat(app, user2Sid);
      await bookSeat(app, user2Sid, eventId, 0, 0, 'reserved').expect(409);
    });

    it('예매 미확정 상태에서 SSE 해제 → 좌석 회수됨 (saved=false)', async () => {
      const userSid = await loginAsUser(app, 'sseuser3', 'pass1234');
      await setupSelectingSeat(app, adminSid, eventId, userSid, 1);
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      // 예매 확정 없이 SSE 해제
      await simulateSseDisconnect(app, userSid);
      await simulateSseCloseTimeout(app, userSid);

      // 좌석이 회수됐으므로 다른 유저가 점유 가능
      const user2Sid = await loginAsUser(app, 'sseuser4', 'pass1234');
      await setupSelectingSeat(app, adminSid, eventId, user2Sid, 1);
      await bookSeat(app, user2Sid, eventId, 0, 0, 'reserved').expect(201);
    });

    it('SSE 해제 후 세션이 LOGIN 상태로 복귀', async () => {
      const userSid = await loginAsUser(app, 'sseuser5', 'pass1234');
      await setupSelectingSeat(app, adminSid, eventId, userSid, 1);

      await simulateSseDisconnect(app, userSid);
      await simulateSseCloseTimeout(app, userSid);

      // LOGIN 상태 → 좌석 점유 불가 (401)
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(401);
    });

    it('SSE 해제 후 대기열 다음 유저가 입장', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      // maxSize=1로 제한
      await withAuth(
        supertest(app.getHttpServer()).post(`/booking/in-booking-pool-size/event/${eventId}`),
        adminSid,
      )
        .send({ maxSize: 1 })
        .expect(201);

      // user1 입장 → SELECTING_SEAT
      const user1Sid = await loginAsUser(app, 'sseuser6', 'pass1234');
      await requestPermission(app, user1Sid, eventId).expect(200);
      await setBookingCount(app, user1Sid, 1).expect(201);
      await transitionToSelectingSeat(app, user1Sid);

      // user2 대기열 진입
      const user2Sid = await loginAsUser(app, 'sseuser7', 'pass1234');
      const waitRes = await requestPermission(app, user2Sid, eventId).expect(200);
      expect(waitRes.body.data.waitingStatus).toBe(true);

      // user1 SSE 해제 → 슬롯 반환 → user2 입장
      await simulateSseDisconnect(app, user1Sid);
      await simulateSseCloseTimeout(app, user1Sid);

      // user2가 ENTERING 상태가 됐으므로 인원 설정 가능
      const countRes = await setBookingCount(app, user2Sid, 1).expect(201);
      expect(countRes.body.data.bookingAmount).toBe(1);
    });
  });

  // ─── SSE 좌석 브로드캐스트 타이밍 ───

  describe('SSE 좌석 브로드캐스트', () => {
    it(`좌석 변경 후 ${SEATS_BROADCAST_INTERVAL}ms 이내에 브로드캐스트 수신`, async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      // SSE 구독용 유저: SELECTING_SEAT 상태까지 진행
      // subscribedSection을 null로 유지: HTTP SSE 연결이 ${eventId}:init 풀에 등록되고
      // getClientResBySid도 init 풀에서 올바르게 조회하도록 한다.
      const sseSid = await loginAsUser(app, 'bcastusr1', 'pass1234');
      await requestPermission(app, sseSid, eventId).expect(200);
      await setBookingCount(app, sseSid, 1).expect(201);
      await transitionToSelectingSeat(app, sseSid);
      // transitionToSelectingSeat는 subscribedSection: 0으로 설정하므로
      // HTTP SSE 연결 전에 null로 되돌려 init 풀 조회를 보장한다.
      const inBookingService = app.get(InBookingService);
      const sseSidSession = await inBookingService.getSession(eventId, sseSid);
      if (sseSidSession) {
        sseSidSession.subscribedSection = null;
        await inBookingService.setSession(eventId, sseSidSession);
      }

      // 좌석 변경용 유저: SELECTING_SEAT 상태까지 진행
      const actorSid = await loginAsUser(app, 'bcastusr2', 'pass1234');
      await requestPermission(app, actorSid, eventId).expect(200);
      await setBookingCount(app, actorSid, 1).expect(201);
      await transitionToSelectingSeat(app, actorSid);

      const server = app.getHttpServer();
      if (!server.listening) {
        await new Promise<void>((res) => server.listen(0, res));
      }
      const port = server.address().port;

      const bookingSeatsService = app.get(BookingSeatsService);

      const broadcastTime = await new Promise<number>((resolve, reject) => {
        const TOLERANCE = 200;
        const timeout = setTimeout(() => {
          req.destroy();
          reject(new Error(`브로드캐스트가 ${SEATS_BROADCAST_INTERVAL + TOLERANCE}ms 내에 도착하지 않음`));
        }, SEATS_BROADCAST_INTERVAL + TOLERANCE);

        let changeRequestedAt: number;
        let buffer = '';

        const req = http.get(
          `http://127.0.0.1:${port}/booking/seat/${eventId}`,
          { headers: { Cookie: `SID=${sseSid}` } },
          (sseStream) => {
            // Phase 2: SSE 연결 직후 서비스를 통해 섹션 0 풀로 전환.
            // getClientResBySid로 실제 res 객체를 가져와 switchSseClientSection에 전달한다.
            setTimeout(() => {
              bookingSeatsService
                .getClientResBySid(eventId, sseSid)
                .then((res) => {
                  if (!res) {
                    reject(new Error('getClientResBySid: res not found'));
                    return;
                  }
                  return bookingSeatsService.switchSseClientSection(eventId, 0, res, sseSid);
                })
                .then(() => {
                  // 섹션 전환 완료 → 좌석 변경 수행
                  changeRequestedAt = Date.now();
                  bookSeat(app, actorSid, eventId, 0, 0, 'reserved').expect(201).catch(reject);
                })
                .catch(reject);
            }, 50);

            sseStream.on('data', (chunk: Buffer) => {
              if (!changeRequestedAt) return; // 섹션 전환 완료 전 데이터 무시

              buffer += chunk.toString();

              // SSE 이벤트는 빈 줄(\n\n)로 구분
              const events = buffer.split('\n\n');
              buffer = events.pop() || '';

              for (const event of events) {
                if (!event.trim()) continue;
                // 변경 후 첫 브로드캐스트
                const elapsed = Date.now() - changeRequestedAt;
                clearTimeout(timeout);
                req.destroy();
                resolve(elapsed);
                return;
              }
            });
          },
        );

        req.on('error', (err) => {
          if (err.message !== 'socket hang up') {
            clearTimeout(timeout);
            reject(err);
          }
        });
      });

      expect(broadcastTime).toBeLessThanOrEqual(SEATS_BROADCAST_INTERVAL + 200);
    });
  });

  // ─── 관리자: 예약 초기화 ───

  describe('POST /booking/init/:eventId', () => {
    it('관리자가 예약 초기화 → 성공', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      // 재초기화
      await openEventReservation(app, adminSid, eventId).expect(201);
    });

    it('관리자 예약 초기화 → WAITING 큐 리스트와 순번 키까지 초기화', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      await withAuth(
        supertest(app.getHttpServer()).post(`/booking/in-booking-pool-size/event/${eventId}`),
        adminSid,
      )
        .send({ maxSize: 1 })
        .expect(201);

      const user1Sid = await loginAsUser(app, 'initwait1', 'pass1234');
      await requestPermission(app, user1Sid, eventId).expect(200);
      await setBookingCount(app, user1Sid, 1).expect(201);
      await transitionToSelectingSeat(app, user1Sid);

      const user2Sid = await loginAsUser(app, 'initwait2', 'pass1234');
      const waitRes = await requestPermission(app, user2Sid, eventId).expect(200);
      expect(waitRes.body.data.waitingStatus).toBe(true);

      const redis = redisService.getOrThrow();
      expect(await redis.llen(`waiting-queue:${eventId}`)).toBe(1);
      expect(await redis.get(`waiting-queue:${eventId}:order`)).toBe('1');

      await openEventReservation(app, adminSid, eventId).expect(201);

      expect(await redis.llen(`waiting-queue:${eventId}`)).toBe(0);
      expect(await redis.get(`waiting-queue:${eventId}:order`)).toBeNull();

      const user2Session = await app.get(AuthService).getUserSession(user2Sid);
      expect(user2Session.userStatus).toBe('LOGIN');
      expect(user2Session.targetEvent).toBeNull();
    });

    it('예약 초기화는 닫는 이벤트 참가자만 LOGIN/null로 정리하고 다른 이벤트 상태는 보존한다', async () => {
      const secondEventId = await createEvent(app, adminSid, programId, {
        reservationOpenDate: new Date(Date.now() - 86400000).toISOString(),
      });
      await openEventReservation(app, adminSid, eventId).expect(201);
      await openEventReservation(app, adminSid, secondEventId).expect(201);

      const setupActiveParticipants = async (
        targetEventId: number,
        userPrefix: string,
      ): Promise<{
        waitingSid: string;
        enteringSid: string;
        selectingSid: string;
        reconnectingSid: string;
      }> => {
        const selectingSid = await loginAsUser(app, `${userPrefix}sel`, 'pass1234');
        await requestPermission(app, selectingSid, targetEventId).expect(200);
        await setBookingCount(app, selectingSid, 1).expect(201);
        await transitionToSelectingSeat(app, selectingSid);

        const reconnectingSid = await loginAsUser(app, `${userPrefix}rec`, 'pass1234');
        await requestPermission(app, reconnectingSid, targetEventId).expect(200);
        await setBookingCount(app, reconnectingSid, 1).expect(201);
        await transitionToSelectingSeat(app, reconnectingSid);
        await simulateSseDisconnect(app, reconnectingSid);

        const enteringSid = await loginAsUser(app, `${userPrefix}ent`, 'pass1234');
        await requestPermission(app, enteringSid, targetEventId).expect(200);

        await withAuth(
          supertest(app.getHttpServer()).post(`/booking/in-booking-pool-size/event/${targetEventId}`),
          adminSid,
        )
          .send({ maxSize: 2 })
          .expect(201);

        const waitingSid = await loginAsUser(app, `${userPrefix}wait`, 'pass1234');
        const waitRes = await requestPermission(app, waitingSid, targetEventId).expect(200);
        expect(waitRes.body.data.waitingStatus).toBe(true);

        return { waitingSid, enteringSid, selectingSid, reconnectingSid };
      };

      const closing = await setupActiveParticipants(eventId, 'ica');
      const preserved = await setupActiveParticipants(secondEventId, 'icb');
      const redis = redisService.getOrThrow();
      const authService = app.get(AuthService);

      const eventBSeatKeysBefore = await redis.keys(`event:${secondEventId}:*`);
      expect(eventBSeatKeysBefore.length).toBeGreaterThan(0);

      await openEventReservation(app, adminSid, eventId).expect(201);

      for (const sid of Object.values(closing)) {
        const session = await authService.getUserSession(sid);
        expect(session.userStatus).toBe('LOGIN');
        expect(session.targetEvent).toBeNull();
        expect(await redis.exists(`user:${sid}`)).toBe(1);
      }

      expect(await redis.llen(`waiting-queue:${eventId}`)).toBe(0);
      expect(await redis.get(`waiting-queue:${eventId}:order`)).toBeNull();
      expect(await redis.zscore(`entering:${eventId}`, closing.enteringSid)).toBeNull();
      expect(await redis.hget(`in-booking:${eventId}:sessions`, closing.selectingSid)).toBeNull();
      expect(await redis.hget(`in-booking:${eventId}:sessions`, closing.reconnectingSid)).toBeNull();
      expect(await redis.zscore(`reconnecting:${eventId}`, closing.reconnectingSid)).toBeNull();

      expect(await redis.llen(`waiting-queue:${secondEventId}`)).toBe(1);
      expect(await redis.zscore(`entering:${secondEventId}`, preserved.enteringSid)).not.toBeNull();
      expect(
        await redis.hget(`in-booking:${secondEventId}:sessions`, preserved.selectingSid),
      ).not.toBeNull();
      expect(
        await redis.hget(`in-booking:${secondEventId}:sessions`, preserved.reconnectingSid),
      ).not.toBeNull();
      expect(await redis.zscore(`reconnecting:${secondEventId}`, preserved.reconnectingSid)).not.toBeNull();
      expect((await redis.keys(`event:${secondEventId}:*`)).length).toBe(eventBSeatKeysBefore.length);

      const waitingSession = await authService.getUserSession(preserved.waitingSid);
      expect(waitingSession.userStatus).toBe('WAITING');
      expect(waitingSession.targetEvent).toBe(secondEventId);

      const enteringSession = await authService.getUserSession(preserved.enteringSid);
      expect(enteringSession.userStatus).toBe('ENTERING');
      expect(enteringSession.targetEvent).toBe(secondEventId);

      const selectingSession = await authService.getUserSession(preserved.selectingSid);
      expect(selectingSession.userStatus).toBe('SELECTING_SEAT');
      expect(selectingSession.targetEvent).toBe(secondEventId);

      const reconnectingSession = await authService.getUserSession(preserved.reconnectingSid);
      expect(reconnectingSession.userStatus).toBe('RECONNECTING_SELECTING');
      expect(reconnectingSession.targetEvent).toBe(secondEventId);
    });

    it('일반 유저 → 401', async () => {
      const userSid = await loginAsUser(app, 'inituser1', 'pass1234');

      const bErrRes9 = await withAuth(
        supertest(app.getHttpServer()).post(`/booking/init/${eventId}`),
        userSid,
      ).expect(401);
      expect(bErrRes9.body.success).toBe(false);
    });
  });
});
