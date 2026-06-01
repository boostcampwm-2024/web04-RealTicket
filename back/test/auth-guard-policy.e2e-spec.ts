import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

import { USER_STATUS } from 'src/auth/const/userStatus.const';
import { USER_ROLE } from 'src/domains/user/const/userRole';
import { TestRedisService } from 'src/testing/redis/test-redis.service';

import {
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
  switchSection,
  withAuth,
} from './helpers/e2e-setup';

describe('Auth guard role/state requirement policy (e2e)', () => {
  let app: INestApplication;
  let redisService: TestRedisService;
  let adminSid: string;
  let eventId: number;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);

    adminSid = await loginAsAdmin(app, 'policyadmin', 'pass1234');
    const placeId = await createPlace(app, adminSid);
    await createSections(app, adminSid, placeId, [
      { name: 'A구역', colLen: 3, seats: [1, 1, 1, 1, 1, 1], order: 0 },
    ]);
    const programId = await createProgram(app, adminSid, placeId);
    eventId = await createEvent(app, adminSid, programId, {
      reservationOpenDate: new Date(Date.now() - 86400000).toISOString(),
    });
  });

  beforeEach(async () => {
    await redisService.flushAll();
    await cleanupReservedSeats(app, eventId);
    adminSid = await loginAsAdmin(app, 'policyadmin', 'pass1234');
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  async function patchUserSession(sid: string, patch: Record<string, unknown>) {
    const redis = redisService.getOrThrow();
    const rawSession = await redis.get(`user:${sid}`);
    if (!rawSession) {
      throw new Error(`Missing test session for sid=${sid}`);
    }

    await redis.set(`user:${sid}`, JSON.stringify({ ...JSON.parse(rawSession), ...patch }));
  }

  it('uses USER_ROLE.ADMIN for admin-only routes', async () => {
    const userSid = await loginAsUser(app, 'policyuser1', 'pass1234');

    await withAuth(supertest(app.getHttpServer()).delete('/user/guest'), userSid).expect(401);

    const adminRes = await withAuth(supertest(app.getHttpServer()).delete('/user/guest'), adminSid);
    expect(adminRes.status).toBeLessThan(400);
  });

  it('uses USER_ROLE.USER for broad authenticated routes even in booking states', async () => {
    const userSid = await loginAsUser(app, 'policyuser2', 'pass1234');
    await patchUserSession(userSid, {
      userStatus: USER_STATUS.WAITING,
      targetEvent: eventId,
      roles: [USER_ROLE.USER],
    });

    await withAuth(supertest(app.getHttpServer()).get('/user'), userSid).expect(200);
  });

  it('keeps selecting-seat routes exact state-only despite login or admin roles', async () => {
    const loginSid = await loginAsUser(app, 'policyuser3', 'pass1234');
    await switchSection(app, loginSid, 0).expect(401);

    await patchUserSession(adminSid, {
      userStatus: USER_STATUS.LOGIN,
      roles: [USER_ROLE.USER, USER_ROLE.ADMIN],
      targetEvent: null,
    });
    await switchSection(app, adminSid, 0).expect(401);

    const selectingSid = await loginAsUser(app, 'policyuser4', 'pass1234');
    await setupSelectingSeat(app, adminSid, eventId, selectingSid, 1, 0);
    await switchSection(app, selectingSid, 0).expect(200);
  });
});
