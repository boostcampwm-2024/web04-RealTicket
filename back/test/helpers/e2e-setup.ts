import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test as NestTest, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';

import { AppModule } from 'src/app.module';
import { AuthService } from 'src/auth/service/auth.service';
import { BookingService } from 'src/domains/booking/service/booking.service';
import { InBookingService } from 'src/domains/booking/service/in-booking.service';
import { TestRedisService } from 'src/testing/redis/test-redis.service';

/**
 * E2E 테스트용 NestJS 앱 인스턴스를 생성한다.
 * - moduleFactory가 NODE_ENV=test를 감지해 자동으로 in-memory DB + mock Redis 사용
 * - main.ts의 글로벌 설정(ValidationPipe, cookieParser)을 동일하게 적용
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await NestTest.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  app.use(cookieParser());
  await app.init();

  return app;
}

/**
 * TestRedisService 인스턴스를 가져온다.
 */
export function getRedisService(app: INestApplication): TestRedisService {
  return app.get(TestRedisService);
}

// ─── Auth Helpers ───

/**
 * 회원가입 요청을 보낸다.
 */
export function signup(app: INestApplication, loginId: string, loginPassword: string) {
  return supertest(app.getHttpServer()).post('/user/signup').send({ loginId, loginPassword });
}

/**
 * 관리자 회원가입 요청을 보낸다.
 */
export function signupAdmin(app: INestApplication, loginId: string, loginPassword: string) {
  return supertest(app.getHttpServer()).post('/user/signup/admin').send({ loginId, loginPassword });
}

/**
 * 로그인 후 SID 쿠키를 반환한다.
 */
export async function loginUser(
  app: INestApplication,
  loginId: string,
  loginPassword: string,
): Promise<string> {
  const res = await supertest(app.getHttpServer())
    .post('/user/login')
    .send({ loginId, loginPassword })
    .expect(201);

  return extractSid(res);
}

/**
 * 게스트 로그인 후 SID 쿠키를 반환한다.
 */
export async function loginAsGuest(app: INestApplication): Promise<string> {
  const res = await supertest(app.getHttpServer()).get('/user/guest').expect(200);
  return extractSid(res);
}

/**
 * 일반 유저로 회원가입 + 로그인 후 SID를 반환한다.
 * DB가 테스트 간에 유지되므로 이미 가입된 경우(409)는 로그인만 수행한다.
 */
export async function loginAsUser(
  app: INestApplication,
  loginId: string,
  loginPassword: string,
): Promise<string> {
  const signupRes = await signup(app, loginId, loginPassword);
  if (signupRes.status !== 201 && signupRes.status !== 409) {
    throw new Error(`User signup failed with status ${signupRes.status}`);
  }
  return loginUser(app, loginId, loginPassword);
}

/**
 * 관리자로 회원가입 + 로그인 후 SID를 반환한다.
 * DB가 테스트 간에 유지되므로 이미 가입된 경우(409)는 로그인만 수행한다.
 */
export async function loginAsAdmin(
  app: INestApplication,
  loginId = 'admin1234',
  loginPassword = 'admin1234',
): Promise<string> {
  const signupRes = await signupAdmin(app, loginId, loginPassword);
  if (signupRes.status !== 201 && signupRes.status !== 409) {
    throw new Error(`Admin signup failed with status ${signupRes.status}`);
  }
  return loginUser(app, loginId, loginPassword);
}

/**
 * supertest 응답에서 SID 쿠키 값을 추출한다.
 */
export function extractSid(res: supertest.Response): string {
  const rawCookies = res.headers['set-cookie'];
  const cookies = Array.isArray(rawCookies) ? rawCookies : rawCookies ? [rawCookies] : undefined;
  if (!cookies) {
    throw new Error('set-cookie 헤더가 없습니다.');
  }

  const sidCookie = cookies.find((c) => c.startsWith('SID='));
  if (!sidCookie) {
    throw new Error('SID 쿠키를 찾을 수 없습니다.');
  }

  return sidCookie.split('=')[1].split(';')[0];
}

/**
 * SID 쿠키를 포함한 인증 요청을 생성한다.
 */
export function withAuth(req: supertest.Test, sid: string): supertest.Test {
  return req.set('Cookie', `SID=${sid}`);
}

// ─── Data Helpers ───

/**
 * 테스트용 Place를 생성하고 ID를 반환한다.
 */
export async function createPlace(
  app: INestApplication,
  adminSid: string,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const body = {
    name: 'Test Hall',
    address: 'Test Address 123',
    overviewSvg: '<svg></svg>',
    overviewHeight: 500,
    overviewWidth: 800,
    overviewPoints: '[]',
    ...overrides,
  };

  const res = await withAuth(supertest(app.getHttpServer()).post('/place'), adminSid).send(body).expect(201);

  return res.body.id;
}

/**
 * 테스트용 Section을 생성한다.
 */
export async function createSections(
  app: INestApplication,
  adminSid: string,
  placeId: number,
  sections: Array<{ name: string; colLen: number; seats: number[]; order: number }> = [
    { name: 'A구역', colLen: 3, seats: [1, 1, 1, 1, 1, 1], order: 0 },
  ],
) {
  const body = sections.map((s) => ({ ...s, placeId }));

  return withAuth(supertest(app.getHttpServer()).post('/place/section'), adminSid).send(body).expect(201);
}

/**
 * 테스트용 Program을 생성하고 ID를 반환한다.
 */
export async function createProgram(
  app: INestApplication,
  adminSid: string,
  placeId: number,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const body = {
    name: 'Test Program',
    profileUrl: 'https://example.com/poster.jpg',
    runningTime: 120,
    genre: 'Musical',
    actors: 'Actor A, Actor B',
    price: 50000,
    placeId,
    ...overrides,
  };

  const res = await withAuth(supertest(app.getHttpServer()).post('/program'), adminSid)
    .send(body)
    .expect(201);

  return res.body.id;
}

/**
 * 테스트용 Event를 생성하고 ID를 반환한다.
 */
export async function createEvent(
  app: INestApplication,
  adminSid: string,
  programId: number,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const now = new Date();
  const body = {
    runningDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    reservationOpenDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    reservationCloseDate: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString(),
    programId,
    ...overrides,
  };

  const res = await withAuth(supertest(app.getHttpServer()).post('/event'), adminSid).send(body).expect(201);

  return res.body.id;
}

// ─── Booking Helpers ───

/**
 * 관리자 권한으로 이벤트 예약을 초기화하고 오픈한다.
 */
export function openEventReservation(app: INestApplication, adminSid: string, eventId: number) {
  return withAuth(supertest(app.getHttpServer()).post(`/booking/init/${eventId}`), adminSid);
}

/**
 * 이벤트 입장 허가를 요청한다.
 */
export function requestPermission(app: INestApplication, sid: string, eventId: number) {
  return withAuth(supertest(app.getHttpServer()).get(`/booking/permission/${eventId}`), sid);
}

/**
 * 예매 인원 수를 설정한다.
 */
export function setBookingCount(app: INestApplication, sid: string, bookingAmount: number) {
  return withAuth(supertest(app.getHttpServer()).post('/booking/count'), sid).send({ bookingAmount });
}

/**
 * 좌석 점유/취소 요청을 보낸다.
 */
export function bookSeat(
  app: INestApplication,
  sid: string,
  eventId: number,
  sectionIndex: number,
  seatIndex: number,
  expectedStatus: 'reserved' | 'deleted',
) {
  return withAuth(supertest(app.getHttpServer()).post('/booking'), sid).send({
    eventId,
    sectionIndex,
    seatIndex,
    expectedStatus,
  });
}

/**
 * SSE 연결을 우회하여 ENTERING → SELECTING_SEAT 상태 전환을 수행한다.
 * 반드시 setBookingCount 호출 후 사용해야 한다.
 */
export async function transitionToSelectingSeat(app: INestApplication, sid: string) {
  const bookingService = app.get(BookingService);
  await bookingService.setInBookingFromEntering(sid);
}

/**
 * SSE 연결 해제 시 발생하는 1차 처리를 시뮬레이션한다.
 * req.on('close') 핸들러가 수행하는 동작:
 * - 유저 상태를 RECONNECTING_SELECTING으로 변경
 * - reconnecting 세션 풀에 등록
 */
export async function simulateSseDisconnect(app: INestApplication, sid: string) {
  const authService = app.get(AuthService);
  const inBookingService = app.get(InBookingService);
  const eventId = await authService.getUserEventTarget(sid);
  await authService.setUserStatusReconnectingSelecting(sid);
  await inBookingService.addReconnectingSession(eventId, sid);
}

/**
 * SSE 연결 해제 후 재연결 타임아웃이 만료됐을 때의 정리 로직을 시뮬레이션한다.
 * 실제로는 removeExpiredReconnectingSessions가 reconnecting 풀에서 제거한 뒤
 * seats-sse-close 이벤트를 발행한다. 이 순서를 재현한다:
 * 1. reconnecting 풀에서 제거
 * 2. 미저장 좌석 회수
 * 3. in-booking 세션 정리 (상태 → LOGIN)
 * 4. 대기열 다음 유저 입장
 */
export async function simulateSseCloseTimeout(app: INestApplication, sid: string) {
  const authService = app.get(AuthService);
  const inBookingService = app.get(InBookingService);
  const eventId = await authService.getUserEventTarget(sid);
  await inBookingService.removeReconnectingSession(eventId, sid);

  const bookingService = app.get(BookingService);
  await bookingService.onSeatsSseDisconnected({ sid });
}

/**
 * 타임아웃 내 재연결을 시뮬레이션한다.
 * GET /booking/seat/:eventId 컨트롤러의 RECONNECTING_SELECTING 분기를 직접 재현:
 * 1. reconnecting 풀에서 제거
 * 2. 유저 상태를 SELECTING_SEAT으로 복구
 * bookedSeats는 in-booking 세션에 그대로 유지된다.
 */
export async function simulateSSEReconnect(app: INestApplication, sid: string) {
  const authService = app.get(AuthService);
  const inBookingService = app.get(InBookingService);
  const eventId = await authService.getUserEventTarget(sid);
  await inBookingService.removeReconnectingSession(eventId, sid);
  await authService.setUserStatusSelectingSeat(sid);
}

/**
 * 유저를 좌석 선택 상태(SELECTING_SEAT)까지 한 번에 진행시킨다.
 * 이벤트 오픈 → 입장 허가 → 인원 설정 → 상태 전환
 */
export async function setupSelectingSeat(
  app: INestApplication,
  adminSid: string,
  eventId: number,
  userSid: string,
  bookingAmount: number = 1,
) {
  await openEventReservation(app, adminSid, eventId).expect(201);
  await requestPermission(app, userSid, eventId).expect(200);
  await setBookingCount(app, userSid, bookingAmount).expect(201);
  await transitionToSelectingSeat(app, userSid);
}

/**
 * WAITING_QUEUE SSE 타임아웃 초과를 시뮬레이션한다.
 * 실제 서버에는 WAITING 유저의 자동 타임아웃 GC가 없으므로,
 * "시스템이 오랫동안 재연결하지 않은 유저를 정리"하는 동작을 직접 재현한다:
 * 1. Redis 큐(waiting-queue:{eventId})에서 해당 sid를 제거
 * 2. 유저 상태를 LOGIN으로 복귀
 */
export async function simulateWaitingSseTimeout(app: INestApplication, sid: string): Promise<void> {
  const authService = app.get(AuthService);
  const eventId = await authService.getUserEventTarget(sid);

  if (eventId === null) {
    throw new Error(`simulateWaitingSseTimeout: sid=${sid}의 targetEvent가 null입니다.`);
  }

  // TestRedisService.getOrThrow()로 ioredis 인스턴스를 가져와 lrange/lrem 직접 호출
  const redis = getRedisService(app).getOrThrow();
  const queueKey = `waiting-queue:${eventId}`;
  const items = await redis.lrange(queueKey, 0, -1);
  for (const item of items) {
    try {
      const parsed = JSON.parse(item);
      if (parsed.sid === sid) {
        await redis.lrem(queueKey, 1, item);
        break;
      }
    } catch {
      // JSON 파싱 실패 항목은 무시
    }
  }

  // getAllWaitingSids가 큐 없음을 캐치할 수 있도록 queueSubscription 정리는 하지 않음
  // (실제 timeout 처리와 동일하게 상태만 변경)
  await authService.setUserStatusLogin(sid);
}
