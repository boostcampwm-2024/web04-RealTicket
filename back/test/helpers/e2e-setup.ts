import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test as NestTest, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import supertest from 'supertest';

import { AppModule } from 'src/app.module';
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
