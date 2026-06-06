import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

import { AuthService } from 'src/auth/service/auth.service';
import { BookingService } from 'src/domains/booking/service/booking.service';
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
  simulateSseCloseTimeout,
  simulateSseDisconnect,
  transitionToSelectingSeat,
  withAuth,
} from './helpers/e2e-setup';

describe('booking abnormal flows', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let authService: AuthService;
  let bookingService: BookingService;
  let inBookingService: InBookingService;
  let adminSid: string;
  let placeId: number;
  let programId: number;
  let eventId: number;
  let eventId2: number;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);
    authService = app.get(AuthService);
    bookingService = app.get(BookingService);
    inBookingService = app.get(InBookingService);

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
    await cleanupReservedSeats(app, eventId);
    await cleanupReservedSeats(app, eventId2);
    adminSid = await loginAsAdmin(app, 'abnadmin1', 'pass1234');
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  describe('state jumps and duplicate admission', () => {
    it('ABN-01: duplicate permission while ENTERING keeps the same state', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn01user1', 'pass1234');

      await requestPermission(app, userSid, eventId).expect(200);
      const sessionBefore = await authService.getUserSession(userSid);
      expect(sessionBefore.userStatus).toBe('ENTERING');

      await requestPermission(app, userSid, eventId).expect(200);

      const sessionAfter = await authService.getUserSession(userSid);
      expect(sessionAfter.userStatus).toBe('ENTERING');
      expect(sessionAfter.targetEvent).toBe(eventId);
    });

    it('ABN-01b: admission Lua write failure does not leak targetEvent or entering slot', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn01buser1', 'pass1234');
      const redis = getRedisService(app).getOrThrow();
      await redis.set(`entering:${eventId}`, 'wrong-type');

      const res = await requestPermission(app, userSid, eventId);

      expect(res.status).toBe(500);
      const sessionAfter = await authService.getUserSession(userSid);
      expect(sessionAfter.userStatus).toBe('LOGIN');
      expect(sessionAfter.targetEvent).toBeNull();

      expect(await redis.get(`entering:${eventId}`)).toBe('wrong-type');
    });

    it('ABN-02: SELECTING_SEAT cross-event permission returns 400 without mutation', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      await openEventReservation(app, adminSid, eventId2).expect(201);
      const userSid = await loginAsUser(app, 'abn02usera', 'pass1234');

      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);
      const beforeSession = await authService.getUserSession(userSid);
      expect(beforeSession.userStatus).toBe('SELECTING_SEAT');

      const redis = getRedisService(app).getOrThrow();
      const enteringCountBefore = await redis.zcard(`entering:${eventId2}`);
      const queueSizeBefore = await redis.llen(`waiting-queue:${eventId2}`);

      const res = await requestPermission(app, userSid, eventId2);

      expect(res.status).toBe(400);
      const afterSession = await authService.getUserSession(userSid);
      expect(afterSession.targetEvent).toBe(eventId);
      expect(afterSession.userStatus).toBe('SELECTING_SEAT');
      expect(await redis.zcard(`entering:${eventId2}`)).toBe(enteringCountBefore);
      expect(await redis.llen(`waiting-queue:${eventId2}`)).toBe(queueSizeBefore);
    });

    it('ABN-03: selecting a seat without booking count returns 400', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn03user1', 'pass1234');

      await requestPermission(app, userSid, eventId).expect(200);
      await transitionToSelectingSeat(app, userSid);

      const session = await authService.getUserSession(userSid);
      expect(session.userStatus).toBe('SELECTING_SEAT');

      const res = await bookSeat(app, userSid, eventId, 0, 0, 'reserved');
      expect(res.status).toBe(400);

      const sessionAfter = await authService.getUserSession(userSid);
      expect(sessionAfter.userStatus).toBe('SELECTING_SEAT');
    });

    it('ABN-04: permission can be requested again after completed reservation cleanup', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn04user1', 'pass1234');

      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);
      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      await withAuth(supertest(app.getHttpServer()).post('/reservation'), userSid)
        .send({ eventId, seats: [{ sectionIndex: 0, seatIndex: 0 }] })
        .expect(201);

      const sessionAfterReservation = await authService.getUserSession(userSid);
      expect(sessionAfterReservation.targetEvent).toBe(eventId);

      await simulateSseDisconnect(app, userSid);
      await simulateSseCloseTimeout(app, userSid);

      const sessionAfterCompletion = await authService.getUserSession(userSid);
      expect(sessionAfterCompletion.userStatus).toBe('LOGIN');

      const res = await requestPermission(app, userSid, eventId).expect(200);
      expect(res.body.data).toEqual(expect.objectContaining({ enteringStatus: true, waitingStatus: false }));

      const sessionAfterReentry = await authService.getUserSession(userSid);
      expect(sessionAfterReentry.userStatus).toBe('ENTERING');
      expect(sessionAfterReentry.targetEvent).toBe(eventId);
    });
  });

  describe('invalid sessions and bad seat operations', () => {
    it('ABN-05: WAITING users cannot book seats', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);

      await withAuth(
        supertest(app.getHttpServer()).post(`/booking/in-booking-pool-size/event/${eventId}`),
        adminSid,
      )
        .send({ maxSize: 1 })
        .expect(201);

      const user1Sid = await loginAsUser(app, 'abn05user1', 'pass1234');
      await requestPermission(app, user1Sid, eventId).expect(200);
      await setBookingCount(app, user1Sid, 1).expect(201);
      await transitionToSelectingSeat(app, user1Sid);

      const user2Sid = await loginAsUser(app, 'abn05user2', 'pass1234');
      const waitRes = await requestPermission(app, user2Sid, eventId).expect(200);
      expect(waitRes.body.data.waitingStatus).toBe(true);

      const res = await bookSeat(app, user2Sid, eventId, 0, 0, 'reserved');
      expect(res.status).toBe(401);
    });

    it('ABN-06: invalid SID cannot call booking APIs', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn06user1', 'pass1234');

      await requestPermission(app, userSid, eventId).expect(200);

      const redis = getRedisService(app).getOrThrow();
      await redis.del(`user:${userSid}`);

      const res = await bookSeat(app, userSid, eventId, 0, 0, 'reserved');
      expect(res.status).toBe(403);
    });

    it('ABN-07: cancelling an already-cancelled seat returns 400', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn07user1', 'pass1234');

      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);

      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);
      await bookSeat(app, userSid, eventId, 0, 0, 'deleted').expect(201);

      const res = await bookSeat(app, userSid, eventId, 0, 0, 'deleted');
      expect(res.status).toBe(400);

      const sessionAfter = await authService.getUserSession(userSid);
      expect(sessionAfter.userStatus).toBe('SELECTING_SEAT');
    });

    it('ABN-08: booking more seats than bookingAmount returns 400', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn08user1', 'pass1234');

      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);

      await bookSeat(app, userSid, eventId, 0, 0, 'reserved').expect(201);

      const res = await bookSeat(app, userSid, eventId, 0, 1, 'reserved');
      expect(res.status).toBe(400);

      const session = await authService.getUserSession(userSid);
      expect(session.userStatus).toBe('SELECTING_SEAT');
    });

    it('ABN-09: wrong-event seat SSE rejects before pool mutation', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      await openEventReservation(app, adminSid, eventId2).expect(201);
      const userSid = await loginAsUser(app, 'abn09user1', 'pass1234');

      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);
      await transitionToSelectingSeat(app, userSid);

      const redis = getRedisService(app).getOrThrow();
      const event2InBookingBefore = await redis.hlen(`in-booking:${eventId2}:sessions`);
      const event2ReconnectingBefore = await redis.zcard(`reconnecting:${eventId2}`);

      const res = await withAuth(
        supertest(app.getHttpServer()).get(`/booking/seat/${eventId2}`).timeout({
          response: 1000,
          deadline: 1500,
        }),
        userSid,
      );

      expect(res.status).toBe(400);
      const sessionAfter = await authService.getUserSession(userSid);
      expect(sessionAfter.userStatus).toBe('SELECTING_SEAT');
      expect(sessionAfter.targetEvent).toBe(eventId);
      expect(await redis.hlen(`in-booking:${eventId2}:sessions`)).toBe(event2InBookingBefore);
      expect(await redis.zcard(`reconnecting:${eventId2}`)).toBe(event2ReconnectingBefore);
    });

    it('ABN-10: entering-to-seat transition failure does not create in-booking session', async () => {
      await openEventReservation(app, adminSid, eventId).expect(201);
      const userSid = await loginAsUser(app, 'abn10user1', 'pass1234');
      await requestPermission(app, userSid, eventId).expect(200);
      await setBookingCount(app, userSid, 1).expect(201);

      const startSpy = jest.spyOn(authService, 'startSeatSelection').mockResolvedValueOnce(null);

      await expect(bookingService.setInBookingFromEntering(userSid)).rejects.toThrow();

      const sessionAfter = await authService.getUserSession(userSid);
      expect(sessionAfter.userStatus).toBe('ENTERING');
      expect(await inBookingService.getSession(eventId, userSid)).toBeNull();

      startSpy.mockRestore();
    });
  });
});
