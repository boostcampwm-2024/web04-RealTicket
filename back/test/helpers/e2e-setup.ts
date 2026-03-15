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
 * 관리자로 회원가입 + 로그인 후 SID를 반환한다.
 */
export async function loginAsAdmin(
  app: INestApplication,
  loginId = 'admin1234',
  loginPassword = 'admin1234',
): Promise<string> {
  await signupAdmin(app, loginId, loginPassword).expect(201);
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
