# Testing Utilities

RealTicket 백엔드 테스트를 위한 유틸리티 모듈입니다.

## 개요

이 모듈은 통합 테스트 및 E2E 테스트를 위한 테스트 환경을 제공합니다:
- **TestRedisModule**: In-memory Redis mock (ioredis-mock)
- **TestDatabaseModule**: In-memory SQLite 데이터베이스 (better-sqlite3)

외부 Redis와 MySQL 의존성 없이 빠르고 격리된 테스트 환경을 구축할 수 있습니다.

## 주요 기능

### Redis 테스트
- **TestRedisModule**: NestJS 테스트 모듈 (프로덕션 RedisModule 대체)
- **TestRedisService**: In-memory Redis mock 서비스
- **테스트 헬퍼 함수**: 데이터 격리를 위한 유틸리티

### Database 테스트
- **TestDatabaseModule**: SQLite in-memory 데이터베이스 모듈
- **testDatabaseConfig**: TypeORM 설정 (MySQL 대체)

## 설치

테스트 의존성은 이미 `devDependencies`에 포함되어 있습니다:
- `ioredis-mock@^8.9.0`: Redis mock
- `better-sqlite3@^9.6.0`: SQLite in-memory database

```bash
npm install
```

## 사용 방법

### 1. 단위 테스트 / 통합 테스트

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { TestRedisModule, TestRedisService } from '../../../testing';
import { BookingSeatsService } from './booking-seats.service';
import { InBookingService } from './in-booking.service';

describe('BookingSeatsService', () => {
  let service: BookingSeatsService;
  let redisService: TestRedisService;
  let module: TestingModule;

  beforeEach(async () => {
    // TestRedisModule을 import하여 Redis mock 사용
    module = await Test.createTestingModule({
      imports: [TestRedisModule],
      providers: [
        BookingSeatsService,
        InBookingService,
        // ... 기타 의존성
      ],
    }).compile();

    service = module.get<BookingSeatsService>(BookingSeatsService);
    redisService = module.get<TestRedisService>(TestRedisService);

    // 테스트 전 Redis 데이터 초기화
    await redisService.flushAll();
  });

  afterEach(async () => {
    // 테스트 후 정리
    await redisService.flushAll();
    await module.close();
  });

  it('should initialize section seats correctly', async () => {
    const eventId = 1;
    const seats = [[1, 0, 1], [1, 1, 0]];

    await service.openReservation(eventId, seats);

    const result = await service.getSeats(eventId);
    expect(result).toEqual(seats);
  });
});
```

### 2. E2E 테스트 (Redis + Database)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import * as request from 'supertest';
import {
  TestRedisModule,
  TestRedisService,
  TestDatabaseModule
} from '../src/testing';
import { AppModule } from '../src/app.module';

describe('Booking E2E', () => {
  let app: INestApplication;
  let redisService: TestRedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Redis와 Database를 테스트용으로 오버라이드
      .overrideModule(RedisModule)
      .useModule(TestRedisModule)
      .overrideModule(TypeOrmModule)
      .useModule(TestDatabaseModule)
      .compile();

    app = moduleFixture.createNestApplication();
    redisService = moduleFixture.get<TestRedisService>(TestRedisService);

    await app.init();
  });

  beforeEach(async () => {
    // 각 테스트 전 Redis 초기화
    await redisService.flushAll();
  });

  afterEach(async () => {
    await redisService.flushAll();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/booking/seats (GET) - should return seat status', async () => {
    // 테스트 구현
    return request(app.getHttpServer())
      .get('/booking/seats/1')
      .expect(200);
  });
});
```

**전체 예매 플로우 테스트 예제**: `back/test/booking-flow.e2e-spec.ts` 참고

### 3. 헬퍼 함수 사용

```typescript
import {
  TestRedisModule,
  TestRedisService,
  createBeforeEachRedisFlush,
  createAfterEachRedisFlush,
} from '../../../testing';

describe('MyService', () => {
  let redisService: TestRedisService;

  // beforeEach에서 자동으로 Redis 초기화
  beforeEach(createBeforeEachRedisFlush(() => redisService));

  // afterEach에서 자동으로 Redis 정리
  afterEach(createAfterEachRedisFlush(() => redisService));

  it('should work', async () => {
    // 테스트 코드
  });
});
```

## 데이터 격리

각 테스트는 독립적인 Redis 상태를 가져야 합니다. 이를 위해 다음 패턴을 사용합니다:

### 권장 패턴: beforeEach/afterEach에서 FLUSHALL

```typescript
beforeEach(async () => {
  await redisService.flushAll();
});

afterEach(async () => {
  await redisService.flushAll();
});
```

이 패턴은:
- ✅ 완전한 테스트 격리 보장
- ✅ 테스트 간 간섭 방지
- ✅ 예측 가능한 테스트 결과 제공

## 호환성

### 지원되는 Redis 기능

`ioredis-mock`은 다음 기능들을 지원합니다:

- **String 연산**: GET, SET, DEL, UNLINK
- **Bitmap 연산**: GETBIT, SETBIT
- **List 연산**: LPUSH, RPUSH, LPOP, LRANGE, LINDEX, LLEN
- **Set 연산**: SADD, SREM, SMEMBERS, SCARD
- **Sorted Set 연산**: ZADD, ZREM, ZCARD, ZRANGE, ZRANGEBYSCORE, ZREMRANGEBYSCORE
- **Transaction**: MULTI, EXEC
- **Key 연산**: KEYS, EXPIREAT
- **Lua 스크립트**: EVAL

### Lua 스크립트 지원

프로젝트에서 사용하는 모든 Lua 스크립트가 `ioredis-mock`에서 정상 동작합니다:

- ✅ `getSeatsLua`: GETBIT 연산
- ✅ `updateSeatLua`: SETBIT 연산
- ✅ `initSectionSeatLua`: 좌석 초기화
- ✅ `setSectionsLenLua`: 메타데이터 설정

## 주의사항

### ioredis-mock 제약사항

1. **성능 특성**: 실제 Redis와 다른 성능 특성을 가질 수 있습니다.
2. **일부 고급 기능**: 실제 Redis의 모든 기능을 100% 지원하지 않을 수 있습니다.
3. **동시성**: 실제 Redis의 동시성 특성과 다를 수 있습니다.

### 언제 실제 Redis를 사용해야 하나요?

다음 경우에는 실제 Redis (Docker TestContainers 등)를 고려하세요:

- Redis 특정 성능 테스트
- 프로덕션 환경과 100% 동일한 동작 검증
- ioredis-mock에서 지원하지 않는 기능 사용

## 트러블슈팅

### 문제: 테스트 간 데이터가 남아있음

**해결**: `beforeEach`와 `afterEach`에서 `flushAll()`을 호출하고 있는지 확인하세요.

```typescript
beforeEach(async () => {
  await redisService.flushAll();
});
```

### 문제: Lua 스크립트 오류

**해결**: `ioredis-mock`이 최신 버전인지 확인하세요. 일부 Lua 기능은 버전에 따라 다를 수 있습니다.

### 문제: RedisService를 찾을 수 없음

**해결**: `TestRedisModule`을 imports에 추가했는지 확인하세요.

```typescript
const module = await Test.createTestingModule({
  imports: [TestRedisModule], // 여기!
  providers: [YourService],
}).compile();
```

## 테스트 실행

```bash
# E2E 테스트 실행
npm run test:e2e

# 특정 테스트 파일만 실행
npm run test:e2e -- booking-flow.e2e-spec.ts

# 단위 테스트 실행
npm run test
```

## 예제 파일

- **`back/test/booking-flow.e2e-spec.ts`**: 전체 예매 플로우 통합 테스트
  - Program 조회
  - 로그인 (게스트)
  - Permission 확인
  - 예매 수량 설정
  - 좌석 현황 구독 (SSE)
  - 좌석 점유
  - 예매 확정
  - 로그아웃

## 참고 자료

- [ioredis-mock GitHub](https://github.com/stipsan/ioredis-mock)
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3)
- [TypeORM SQLite](https://typeorm.io/#/connection-options/better-sqlite3-connection-options)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [Jest Documentation](https://jestjs.io/docs/getting-started)
