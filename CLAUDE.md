# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## 프로젝트 개요

Real-Ticket은 NestJS 백엔드 + React 프론트엔드로 구성된 실시간 좌석 예매 서비스다. 고트래픽 환경에서의 좌석 예매를 SSE 기반 실시간 업데이트, Redis 기반 원자적 좌석 상태 관리, 큐 시스템으로 처리하는 것이 핵심이다.

주요 기능:
- SSE 기반 실시간 좌석 가용 상태 업데이트
- 트래픽 제어용 대기열 시스템
- Redis Lua 스크립트를 활용한 원자적 좌석 상태 관리
- 캡차 기반 매크로 방지
- 좌표 기반 좌석 데이터 최적화

## 프로젝트 구조

```
web04-RealTicket/
├── back/          ← NestJS 백엔드
├── front/         ← React 프론트엔드
├── scripts/       ← 유틸리티 스크립트
├── grafana/       ← 모니터링 대시보드
├── prometheus/    ← 메트릭 수집
└── docker-*.yml   ← 환경별 Docker Compose
```

**기본 브랜치:** `dev` (origin/HEAD → origin/dev)

---

## 개발 명령어

### 루트 레벨
- `npm run greenlight` - **커밋 전 필수 실행**: 프론트 단위 테스트 + 백엔드 E2E 테스트를 순서대로 실행하고 통과 시 `.greenlight-stamp` 발급 (in-memory DB/Redis, Docker 불필요)
- `npm run test:front` - 프론트 Vitest 단위 테스트 (1회 실행)
- `npm run test:e2e` - 백엔드 E2E 테스트 (Jest + in-memory SQLite + ioredis-mock)
- `npm run lint-staged` - staged 파일 린트 실행 (Husky)
- `npm run branch` - 커스텀 스크립트로 연결 브랜치 생성
- `npm run prepare` - Husky 훅 초기화

> **pre-commit 훅 주의**: git commit 시 `.greenlight-stamp`가 없거나 10분 초과 시 커밋이 차단된다. 코드 변경 후 반드시 `npm run greenlight`를 먼저 실행할 것.

### 백엔드 (./back/)
- `npm run start:dev:watch` - 핫 리로드 개발 서버
- `npm run start:dev:debug` - 디버그 모드 개발 서버 (포트 9229)
- `npm run start:dev:compiled` - 컴파일된 dist에서 개발 서버 실행
- `npm run start:prod:watch` - 프로덕션 설정 + 개발 모드
- `npm run start:release` - 프로덕션 릴리즈 모드
- `npm run build` - 빌드
- `npm run test` / `npm run test:e2e` - Jest 단위 / E2E 테스트
- `npm run lint` / `npm run prettier` / `npm run format` - 코드 품질

### 프론트엔드 (./front/)
- `npm run dev` - Vite 개발 서버 (포트 30000)
- `npm run build` - 프로덕션 빌드 (TypeScript + Vite)
- `npm run start` - 프로덕션 빌드 미리보기 (포트 30000)
- `npm run test` - Vitest 테스트
- `npm run lint` / `npm run prettier` / `npm run tsc` - 코드 품질

### Docker 개발 환경
```bash
docker-compose up

# 서비스 접근:
# - Frontend:   http://localhost:30000
# - Backend:    http://localhost:8080
# - MySQL:      localhost:3307
# - Redis:      localhost:6380
# - Grafana:    http://localhost:3000
# - Prometheus: http://localhost:9090
```

---

## 아키텍처

### 백엔드 (NestJS)
도메인 주도 모듈 구조:
- `domains/`: 핵심 비즈니스 로직 (booking, event, place, program, reservation, user)
- `auth/`: 인증/인가
- `benchmark/`: 성능 테스트 유틸리티 (`BENCHMARK_MODE` 환경변수로 조건부 임포트)
- `config/`: 환경 설정
- `util/`: 공통 유틸리티 (로깅, 사용자 주입 미들웨어)

주요 기술: TypeORM (MySQL), Redis, SSE, Winston, Swagger

### 프론트엔드 (React + Vite)
- `pages/`: 라우트 레벨 컴포넌트
- `components/`: 재사용 UI 컴포넌트
- `providers/`: Context 프로바이더 (Auth, Query, Confirm)
- `api/`: API 클라이언트 및 엔드포인트
- `hooks/`: 커스텀 훅
- `routes/`: React Router 설정 (lazy loading)

주요 기술: TanStack Query, React Router, Tailwind CSS, Axios, Vitest

### 실시간 통신
- SSE로 좌석 업데이트를 클라이언트에 푸시
- 다수 클라이언트 간 단일 데이터 소스 공유로 서버 부하 절감
- Redis Lua 스크립트로 레이스 컨디션 방지

### 큐 시스템
- 피크 타임 서버 과부하 방지를 위한 대기열
- 유저 상태 추적 (waiting → entering → active) — 큐 누수 방지
- 캡차 연동으로 고트래픽 시 부하 분산

---

## 환경 설정

백엔드 환경 파일 위치: `back/src/config/`

**`.env.development`**:
```env
TZ=Asia/Seoul
DATABASE_HOST=localhost
DATABASE_PASSWORD=0000
DATABASE_PORT=3306
DATABASE_SCHEMA=real_ticket
DATABASE_SYNCHRONIZE=false
DATABASE_TYPE=mysql
DATABASE_USERNAME=user
REDIS_HOST=localhost
REDIS_PORT=6379
FRONT_URL=http://localhost:30000
LOG_MAX_SIZE=20m
LOG_MAX_LIFE=30d
LOG_ZIP=true
```

`NODE_ENV` (development/production) 및 `EXEC_MODE` (dev/release) 환경변수로 애플리케이션 동작을 제어한다.

---

## 커밋 메시지 컨벤션

형식: `<Gitmoji> <type>: <내용>` (한국어)

| Gitmoji | type | 용도 |
|---------|------|------|
| ✨ | feat | 새 기능 |
| 🐛 | fix | 버그 수정 |
| ♻️ | refactor | 리팩토링 |
| ✅ | test | 테스트 추가/수정 |
| 🔧 | chore | 빌드/설정/환경 변경 |
| 📝 | docs | 문서 작성/수정 |
| 🎨 | style | 코드 스타일 (기능 변경 없음) |

위 목록은 참고용이며 상황에 맞게 자유롭게 사용해도 된다.

예시:
```
✨ feat: 예매 확정 세션의 SSE 해제 시 즉시 정리
🐛 fix: getSeats에서 place null 체크 순서를 sections 접근 전으로 이동
♻️ refactor: Booking 모듈 Redis 중복 호출 제거
✅ test: SSE 좌석 브로드캐스트 타이밍 E2E 테스트 추가
🔧 chore: 테스트 환경에서 파일 로그를 비활성화
```

---

## 브랜치 네이밍 컨벤션

형식: `<type>/#<이슈번호>-<설명>` (설명은 kebab-case 영어)

| type | 용도 |
|------|------|
| `feat` | 기능 개발 |
| `hotfix` | 긴급 버그 수정 |
| `test` | 테스트 전용 |
| `chore` | 설정/환경 변경 |

예시:
```
feat/#269-sse-heart-beat
feat/#366-booking-redis-redundancy
hotfix/#260-reset-user-status-safly
test/e2e-booking-state-machine-coverage
```

이슈 번호가 없는 경우: `feat/<설명>` (예: `feat/custom-sse-broadcaster`)

**베이스 브랜치:** 항상 `dev`에서 분기, `dev`로 PR

---

## 이슈 작성 컨벤션

```markdown
## (이슈 제목)

<!-- 선택: 배경과 의도를 설명할 때만 추가 -->
### 배경
(작업이 필요한 이유, 문제 상황, 의도 등)

### 구현 목록
- [ ] 구현내용1
- [ ] 구현내용2

### 특이사항
- 없음
```

---

## PR 작성 컨벤션

```markdown
## 📌 이슈 번호
- close #이슈번호

## 🚀 구현 내용
(구현한 내용 서술)

<!-- 필요 시 아래 섹션 추가 -->
## 📘 참고 사항
## ❓ 궁금한 내용
## 🤝 리뷰 요청
```

- PR 제목: 이슈 제목과 동일하게
- PR 대상 브랜치: `dev`
- Merge 방식: Merge commit (squash 아님 — PR별 merge commit이 git log에 남음)

---

## 작업 시 주의사항

- 새 작업 시작 전 반드시 `dev` 브랜치 최신화
- 브랜치 생성 시 이슈 번호 포함 필수 (없으면 먼저 이슈 생성)
- 커밋은 작업 단위로 atomic하게 — 하나의 커밋에 여러 관심사 혼합 금지
- back/front 변경이 함께 있으면 각각 별도 커밋으로 분리
- Redis와 MySQL이 실행 중이어야 백엔드 개발 가능
- 큐 시스템과 SSE는 핵심 기능이므로 변경 시 영향 범위를 신중하게 검토할 것