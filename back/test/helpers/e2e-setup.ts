import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test as NestTest, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';

import { AppModule } from 'src/app.module';
import { AuthService } from 'src/auth/service/auth.service';
import { AppException } from 'src/common/exception/app.exception';
import { GlobalExceptionFilter } from 'src/common/exception/global-exception.filter';
import { ResponseWrapperInterceptor } from 'src/common/interceptor/response-wrapper.interceptor';
import { BookingService } from 'src/domains/booking/service/booking.service';
import { InBookingService } from 'src/domains/booking/service/in-booking.service';
import { ReservedSeat } from 'src/domains/reservation/entity/reservedSeat.entity';
import { USER_ROLE } from 'src/domains/user/const/userRole';
import { CommonErrorCode } from 'src/domains/user/exception/user-error-code';
import { UserService } from 'src/domains/user/service/user.service';
import { TestRedisService } from 'src/testing/redis/test-redis.service';

/**
 * E2E 테스트용 NestJS 앱 인스턴스를 생성한다.
 * - moduleFactory가 NODE_ENV=test를 감지해 자동으로 in-memory DB + mock Redis 사용
 * - main.ts의 글로벌 설정(ValidationPipe, GlobalExceptionFilter, ResponseWrapperInterceptor, cookieParser)을 동일하게 적용
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await NestTest.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      exceptionFactory: () => new AppException(CommonErrorCode.VALIDATION_ERROR),
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseWrapperInterceptor());
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
 * DB가 테스트 간에 유지되므로 이미 가입된 경우(중복)는 로그인만 수행한다.
 * POST /user/signup/admin은 ADMIN 가드가 있으므로 서비스 레이어를 직접 사용한다.
 */
export async function loginAsAdmin(
  app: INestApplication,
  loginId = 'admin1234',
  loginPassword = 'admin1234',
): Promise<string> {
  const userService = app.get(UserService);
  try {
    await userService.registerUser({ loginId, loginPassword }, USER_ROLE.ADMIN);
  } catch {
    // 이미 가입된 경우(LOGIN_ID_DUPLICATED) 무시하고 로그인 진행
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

  return res.body.data.id;
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

  return res.body.data.id;
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

  return res.body.data.id;
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
 *
 * Phase 2 이후 bookSeat/unBookSeat에 VAL 검증이 추가됐다 (D-08: isSidInPool 기반).
 * 권한 검증 통과를 위해 mock Response로 broadcaster 풀(`${eventId}:${defaultSectionIndex}`)에
 * sid를 등록한다. 다른 섹션으로 테스트하려면 호출 후 inBookingService.setSession +
 * BookingSeatsService.addSseClientToSection을 직접 호출한다.
 */
export async function transitionToSelectingSeat(
  app: INestApplication,
  sid: string,
  defaultSectionIndex: number = 0,
) {
  const bookingService = app.get(BookingService);
  await bookingService.setInBookingFromEntering(sid);

  const authService = app.get(AuthService);
  const eventId = await authService.getUserEventTarget(sid);
  if (eventId === null) return;

  // D-08: 테스트 헬퍼에서 mock Response 사용해 SSE 풀에 sid 등록
  // (실제 SSE 연결을 맺지 않는 e2e 테스트가 isSidInPool 검증을 통과하기 위함)
  const { BookingSeatsService } = await import('src/domains/booking/service/booking-seats.service');
  const bookingSeatsService = app.get(BookingSeatsService);
  const mockRes = createMockSseResponse();
  await bookingSeatsService.addSseClientToSection(eventId, defaultSectionIndex, mockRes, sid);
}

/**
 * SSE 풀 등록용 mock Response 객체. 실제 HTTP 연결 없이 broadcaster.addClient의
 * 부수 효과(헤더 전송·socket 옵션·initial write)를 안전하게 흡수한다.
 */
function createMockSseResponse(): import('express').Response {
  const noop = () => undefined;
  const mock = {
    headersSent: false,
    writeHead: noop,
    flushHeaders: noop,
    write: () => true,
    end: noop,
    socket: {
      setKeepAlive: noop,
      setNoDelay: noop,
      setTimeout: noop,
    },
  };
  return mock as unknown as import('express').Response;
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
  if (eventId === null) {
    throw new Error(`simulateSseDisconnect: sid=${sid}의 targetEvent가 null입니다.`);
  }
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
 * 이벤트 오픈 → 입장 허가 → 인원 설정 → 상태 전환 → subscribedSection 설정
 *
 * transitionToSelectingSeat가 subscribedSection을 defaultSectionIndex(기본값 0)로 설정하므로
 * Phase 2 VAL 검증을 통과할 수 있다.
 */
export async function setupSelectingSeat(
  app: INestApplication,
  adminSid: string,
  eventId: number,
  userSid: string,
  bookingAmount: number = 1,
  defaultSectionIndex: number = 0,
) {
  await openEventReservation(app, adminSid, eventId).expect(201);
  await requestPermission(app, userSid, eventId).expect(200);
  await setBookingCount(app, userSid, bookingAmount).expect(201);
  await transitionToSelectingSeat(app, userSid, defaultSectionIndex);
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

/**
 * @deprecated D-07: PATCH /booking/seat/section 엔드포인트가 제거됨.
 * 02-04에서 addSseClientToSectionDirect로 대체됨. 참조 스펙에서 제거 예정.
 * PATCH /booking/seat/section 요청을 보낸다.
 * SELECTING_SEAT 상태 사용자만 성공한다.
 */
export function switchSection(app: INestApplication, sid: string, sectionIndex: number) {
  return withAuth(supertest(app.getHttpServer()).patch('/booking/seat/section'), sid).send({ sectionIndex });
}

/**
 * BookingSeatsService.addSseClientToSection을 직접 호출하여 풀 등록을 시뮬한다.
 * 실제 Response 객체 대신 모킹된 res를 주입 — supertest로 SSE 연결 라이프사이클을 흉내내기 어려운 한계 우회.
 * Phase 2 (A안): query.section?N 경로에서 풀 등록 후 검증 시나리오용.
 *
 * @param app - NestJS 앱 인스턴스
 * @param sid - 세션 ID
 * @param sectionIndex - 등록할 섹션 인덱스
 * @returns mockRes와 seq를 담은 객체
 */
export async function addSseClientToSectionDirect(
  app: INestApplication,
  sid: string,
  sectionIndex: number,
): Promise<{ mockRes: ReturnType<typeof createMockSseResponse>; seq: number }> {
  const authService = app.get(AuthService);
  const eventId = await authService.getUserEventTarget(sid);
  if (eventId === null) {
    throw new Error(`addSseClientToSectionDirect: sid=${sid}의 targetEvent가 null입니다.`);
  }

  const { BookingSeatsService } = await import('src/domains/booking/service/booking-seats.service');
  const bookingSeatsService = app.get(BookingSeatsService);
  const mockRes = createMockSseResponse();
  const seq = await bookingSeatsService.addSseClientToSection(eventId, sectionIndex, mockRes, sid);
  return { mockRes, seq };
}

/**
 * subscribedSection이 설정된 상태에서 SSE 연결 해제를 시뮬레이션한다.
 * bookingSeatsService.removeSseClient는 실제 Response 객체가 필요하므로
 * SSE 풀 제거 없이 세션 상태 변경만 수행한다.
 * (기존 simulateSseDisconnect와 동일한 동작 — 섹션 정보는 세션에 보존됨)
 */
export async function simulateSseDisconnectWithSection(app: INestApplication, sid: string) {
  const authService = app.get(AuthService);
  const inBookingService = app.get(InBookingService);
  const eventId = await authService.getUserEventTarget(sid);
  if (eventId === null) {
    throw new Error(`simulateSseDisconnectWithSection: sid=${sid}의 targetEvent가 null입니다.`);
  }
  await authService.setUserStatusReconnectingSelecting(sid);
  await inBookingService.addReconnectingSession(eventId, sid);
}

/**
 * RECONNECTING_SELECTING → SELECTING_SEAT 상태 복원을 시뮬레이션한다.
 * (기존 simulateSSEReconnect와 동일한 동작 — 컨트롤러 RECONNECTING_SELECTING 분기 재현)
 * SSE 풀 복원(addSseClientToSection)은 실제 Response 객체가 필요하므로 제외.
 * 테스트에서는 getSession으로 subscribedSection이 보존됐는지 직접 확인한다.
 */
export async function simulateSSEReconnectWithSection(app: INestApplication, sid: string) {
  const authService = app.get(AuthService);
  const inBookingService = app.get(InBookingService);
  const eventId = await authService.getUserEventTarget(sid);
  await inBookingService.removeReconnectingSession(eventId, sid);
  await authService.setUserStatusSelectingSeat(sid);
}

/**
 * 특정 이벤트의 ReservedSeat 레코드를 DB에서 물리 삭제한다.
 *
 * BE-01 구현(openReservation 시 DB ReservedSeat 반영) 이후, 예매 확정 테스트가 생성한
 * ReservedSeat 레코드가 동일 eventId를 공유하는 다음 테스트의 Redis 초기화에 영향을 준다.
 * 테스트 간 격리를 위해 beforeEach에서 이 함수를 호출하여 예약 데이터를 정리한다.
 */
export async function cleanupReservedSeats(app: INestApplication, eventId: number): Promise<void> {
  const { DataSource } = await import('typeorm');
  const dataSource = app.get(DataSource);
  await dataSource
    .createQueryBuilder()
    .delete()
    .from(ReservedSeat)
    .where('event_id = :eventId', { eventId })
    .execute();
}
