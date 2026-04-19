import { INestApplication } from '@nestjs/common';
import supertest from 'supertest';

import { TestRedisService } from 'src/testing/redis/test-redis.service';

import {
  createTestApp,
  extractSid,
  getRedisService,
  loginAsAdmin,
  loginAsGuest,
  loginUser,
  signup,
  signupAdmin,
  withAuth,
} from './helpers/e2e-setup';

describe('User (e2e)', () => {
  let app: INestApplication;
  let redisService: TestRedisService;

  beforeAll(async () => {
    app = await createTestApp();
    redisService = getRedisService(app);
  });

  beforeEach(async () => {
    await redisService.flushAll();
  });

  afterAll(async () => {
    await redisService.flushAll();
    await redisService.disconnect();
    await app.close();
  });

  // ─── 회원가입 ───

  describe('POST /user/signup', () => {
    it('정상 회원가입 → 201', async () => {
      const res = await signup(app, 'testuser1', 'pass1234').expect(201);

      expect(res.body).toEqual({
        message: expect.any(String),
      });
    });

    it('같은 ID로 중복 가입 → 409 Conflict', async () => {
      await signup(app, 'testuser2', 'pass1234').expect(201);
      await signup(app, 'testuser2', 'pass1234').expect(409);
    });

    it('loginId가 4자 미만 → 400 Bad Request', async () => {
      await signup(app, 'abc', 'pass1234').expect(400);
    });

    it('loginId가 12자 초과 → 400 Bad Request', async () => {
      await signup(app, 'a'.repeat(13), 'pass1234').expect(400);
    });

    it('loginId에 대문자/특수문자 포함 → 400 Bad Request', async () => {
      await signup(app, 'Test1234', 'pass1234').expect(400);
    });

    it('loginPassword가 4자 미만 → 400 Bad Request', async () => {
      await signup(app, 'testuser3', 'abc').expect(400);
    });
  });

  // ─── 관리자 회원가입 ───

  describe('POST /user/signup/admin', () => {
    it('인증 없이 관리자 회원가입 시도 → 401/403 (가드 적용)', async () => {
      // 인증 가드가 적용되어 있으므로 비인증 요청은 401 또는 403을 반환해야 한다
      const res = await signupAdmin(app, 'myadmin1', 'pass1234');
      expect(res.status).toBeGreaterThanOrEqual(401);
      expect(res.status).toBeLessThan(500);
    });

    it('관리자 권한으로 관리자 회원가입 → 201', async () => {
      const adminSid = await loginAsAdmin(app, 'adminroot', 'pass1234');
      const res = await withAuth(signupAdmin(app, 'newadmin1', 'pass1234'), adminSid).expect(201);

      expect(res.body).toEqual({
        message: expect.any(String),
      });
    });
  });

  // ─── 아이디 중복 체크 ───

  describe('POST /user/checkid', () => {
    it('미등록 ID → available: true', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/user/checkid')
        .send({ loginId: 'newuser11' })
        .expect(201);

      expect(res.body).toEqual({ available: true });
    });

    it('등록된 ID → available: false', async () => {
      await signup(app, 'existing1', 'pass1234').expect(201);

      const res = await supertest(app.getHttpServer())
        .post('/user/checkid')
        .send({ loginId: 'existing1' })
        .expect(201);

      expect(res.body).toEqual({ available: false });
    });
  });

  // ─── 로그인 ───

  describe('POST /user/login', () => {
    beforeEach(async () => {
      await signup(app, 'logintest', 'pass1234');
    });

    it('정상 로그인 → SID 쿠키 발급 + loginId 반환', async () => {
      const res = await supertest(app.getHttpServer())
        .post('/user/login')
        .send({ loginId: 'logintest', loginPassword: 'pass1234' })
        .expect(201);

      const sid = extractSid(res);
      expect(sid).toBeDefined();
      expect(res.body).toEqual(expect.objectContaining({ loginId: 'logintest' }));
    });

    it('잘못된 비밀번호 → 401 Unauthorized', async () => {
      await supertest(app.getHttpServer())
        .post('/user/login')
        .send({ loginId: 'logintest', loginPassword: 'wrongpwd1' })
        .expect(401);
    });

    it('존재하지 않는 ID → 401 Unauthorized', async () => {
      await supertest(app.getHttpServer())
        .post('/user/login')
        .send({ loginId: 'nouser11', loginPassword: 'pass1234' })
        .expect(401);
    });

    it('재로그인 시 이전 세션 무효화', async () => {
      const oldSid = await loginUser(app, 'logintest', 'pass1234');
      const newSid = await loginUser(app, 'logintest', 'pass1234');

      expect(oldSid).not.toBe(newSid);

      // 이전 SID로 접근 시도 → 실패
      await withAuth(supertest(app.getHttpServer()).get('/user'), oldSid).expect(403);

      // 새 SID로 접근 → 성공
      await withAuth(supertest(app.getHttpServer()).get('/user'), newSid).expect(200);
    });
  });

  // ─── 게스트 모드 ───

  describe('GET /user/guest', () => {
    it('게스트 로그인 → SID 쿠키 발급 + 게스트 정보 반환', async () => {
      const res = await supertest(app.getHttpServer()).get('/user/guest').expect(200);

      const sid = extractSid(res);
      expect(sid).toBeDefined();
      expect(res.body).toEqual(
        expect.objectContaining({
          loginId: expect.stringContaining('guest-'),
          userStatus: 'LOGIN',
        }),
      );
    });

    it('게스트 SID로 인증 요청 가능', async () => {
      const sid = await loginAsGuest(app);

      const res = await withAuth(supertest(app.getHttpServer()).get('/user'), sid).expect(200);

      expect(res.body.loginId).toContain('guest-');
    });
  });

  // ─── 사용자 정보 조회 ───

  describe('GET /user', () => {
    it('인증된 사용자 → 사용자 정보 반환', async () => {
      await signup(app, 'infotest', 'pass1234');
      const sid = await loginUser(app, 'infotest', 'pass1234');

      const res = await withAuth(supertest(app.getHttpServer()).get('/user'), sid).expect(200);

      expect(res.body).toEqual(expect.objectContaining({ loginId: 'infotest' }));
    });

    it('SID 없이 접근 → 403 Forbidden', async () => {
      await supertest(app.getHttpServer()).get('/user').expect(403);
    });

    it('잘못된 SID → 403 Forbidden', async () => {
      await withAuth(supertest(app.getHttpServer()).get('/user'), 'invalid-session-id').expect(403);
    });
  });

  // ─── 로그아웃 ───

  describe('POST /user/logout', () => {
    it('정상 로그아웃 → 세션 무효화', async () => {
      await signup(app, 'logout01', 'pass1234');
      const sid = await loginUser(app, 'logout01', 'pass1234');

      // 로그아웃
      await withAuth(supertest(app.getHttpServer()).post('/user/logout'), sid).expect(201);

      // 로그아웃 후 인증 요청 → 실패
      await withAuth(supertest(app.getHttpServer()).get('/user'), sid).expect(403);
    });

    it('미인증 상태에서 로그아웃 → 403 Forbidden', async () => {
      await supertest(app.getHttpServer()).post('/user/logout').expect(403);
    });
  });

  // ─── 관리자 권한 ───

  describe('Admin guard', () => {
    it('관리자 전용 엔드포인트에 일반 유저 접근 → 401', async () => {
      await signup(app, 'normal01', 'pass1234');
      const sid = await loginUser(app, 'normal01', 'pass1234');

      // DELETE /user/guest는 ADMIN 전용
      await withAuth(supertest(app.getHttpServer()).delete('/user/guest'), sid).expect(401);
    });

    it('관리자로 로그인 → 관리자 전용 엔드포인트 접근 가능', async () => {
      const sid = await loginAsAdmin(app, 'admin0001', 'pass1234');

      const res = await withAuth(supertest(app.getHttpServer()).delete('/user/guest'), sid);

      // 200 또는 관련 성공 응답 (게스트가 없어도 에러 아님)
      expect(res.status).toBeLessThan(400);
    });
  });

  // ─── 통합 시나리오 ───

  describe('전체 플로우: 회원가입 → 로그인 → 정보 조회 → 로그아웃', () => {
    it('전체 사용자 생명 주기가 정상 동작한다', async () => {
      // 1. 회원가입
      await signup(app, 'fullflow1', 'pass1234').expect(201);

      // 2. 로그인
      const sid = await loginUser(app, 'fullflow1', 'pass1234');
      expect(sid).toBeDefined();

      // 3. 정보 조회
      const infoRes = await withAuth(supertest(app.getHttpServer()).get('/user'), sid).expect(200);
      expect(infoRes.body.loginId).toBe('fullflow1');

      // 4. 로그아웃
      await withAuth(supertest(app.getHttpServer()).post('/user/logout'), sid).expect(201);

      // 5. 로그아웃 후 접근 불가
      await withAuth(supertest(app.getHttpServer()).get('/user'), sid).expect(403);
    });
  });
});
