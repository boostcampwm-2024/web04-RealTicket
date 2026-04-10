# Roadmap: RealTicket E2E 테스트 확장

## Overview

기존 87개 E2E 테스트를 기반으로, SSE 재연결 상태 머신(Phase 1) → 크로스-이벤트 격리(Phase 2) →
이상 패턴·경계 케이스(Phase 3) 순으로 확장한다. 각 Phase는 독립적으로 실행 가능하며,
`back/test/` 디렉토리에 신규 spec 파일 또는 기존 파일 확장으로 추가한다.

## Phases

- [x] **Phase 1: SSE 재연결 상태 머신** — simulateSSEReconnect 헬퍼 추가 + RECONNECTING 경로 완전 검증 ✅
- [x] **Phase 2: 크로스-이벤트 격리** — 이벤트 A/B 간 상태 간섭 없음 + clearEnteringPool 버그 회귀 (completed 2026-04-09)
- [ ] **Phase 3: 이상 패턴 & 경계 케이스** — 고의적 상태 위반·중복 요청·만료 세션 커버리지

## Phase Details

### Phase 1: SSE 재연결 상태 머신

**Goal**: 타임아웃 내 재연결 경로(세션 유지)를 검증하는 헬퍼와 테스트 추가. WAITING_QUEUE SSE 끊김 분기도 커버.

**Depends on**: 없음 (기존 인프라 기반)

**Requirements**: SSE-01, SSE-02, SSE-03, SSE-04, SSE-05

**Success Criteria** (what must be TRUE):
1. `simulateSSEReconnect(app, sid)` 헬퍼가 e2e-setup.ts에 추가돼 RECONNECTING → SELECTING_SEAT 전환을 수행한다
2. "타임아웃 내 재연결" 테스트가 통과한다: 재연결 후 세션 상태 SELECTING_SEAT, 기존 좌석 점유 유지
3. WAITING_QUEUE SSE 끊김 분기(재연결 성공/타임아웃 초과) 테스트가 통과한다
4. `npm test`가 모든 신규 테스트 포함해 그린 상태

**Plans**: 2 plans

Plans:
- [x] 01-01-PLAN.md — simulateSSEReconnect 헬퍼 구현 + SELECTING_SEAT 재연결 시나리오 테스트 (SSE-01, SSE-02, SSE-05)
- [x] 01-02-PLAN.md — WAITING_QUEUE SSE 끊김 분기 테스트 (재연결 성공 / 타임아웃 초과) (SSE-03, SSE-04)

### Phase 2: 크로스-이벤트 격리

**Goal**: 한 이벤트의 상태 정리가 다른 이벤트 예매 세션을 오염시키지 않음을 검증한다. clearEnteringPool 키 패턴 버그 회귀 테스트 포함.

**Depends on**: Phase 1

**Requirements**: ISO-01, ISO-02, ISO-03, ISO-04, ISO-05

**Success Criteria** (what must be TRUE):
1. 이벤트 A WAITING 정리 후 이벤트 B permission 요청이 200 반환
2. 이벤트 A 예매 완료 후 이벤트 B permission → SELECTING_SEAT까지 정상 흐름
3. clearEnteringPool(이벤트A) 후 이벤트B의 `entering:{sid}:temp-booking-amount` Redis 키가 그대로 존재
4. `npm test` 그린

**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — 이벤트 A WAITING 이탈 → 이벤트 B 예매 흐름 간섭 없음 테스트 (ISO-01, ISO-02)
- [x] 02-02-PLAN.md — 이벤트 A 완료 후 이벤트 B 예매 흐름 + clearEnteringPool 버그 회귀 테스트 (ISO-03, ISO-04, ISO-05)

### Phase 3: 이상 패턴 & 경계 케이스

**Goal**: 고의적 상태 위반, 중복 요청, 잘못된 순서 API 호출 등 비정상 흐름에 대해 서버가 일관되게 응답함을 검증한다.

**Depends on**: Phase 2

**Requirements**: ABN-01, ABN-02, ABN-03, ABN-04, ABN-05, ABN-06, ABN-07, ABN-08

**Success Criteria** (what must be TRUE):
1. 각 이상 패턴에 대해 명시된 HTTP 상태 코드(400/401/403/409)가 반환된다
2. 이상 요청 후 서버 내부 상태(Redis)가 오염되지 않는다 (후속 정상 요청 정상 동작 확인)
3. `npm test` 그린

**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — 상태 점프·중복 요청 이상 패턴 테스트 (ABN-01 ~ ABN-04)
- [ ] 03-02-PLAN.md — 만료 세션·잘못된 상태 좌석 조작 이상 패턴 테스트 (ABN-05 ~ ABN-08)

## Progress

**Execution Order:** Phase 1 → Phase 2 → Phase 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. SSE 재연결 상태 머신 | 2/2 | ✅ Complete | 2026-04-09 |
| 2. 크로스-이벤트 격리 | 2/2 | ✅ Complete | 2026-04-09 |
| 3. 이상 패턴 & 경계 케이스 | 0/2 | Planned | - |

**Total:** 4/6 plans complete

---
*Roadmap created: 2026-04-09*
*Last updated: 2026-04-10 — Phase 3 플랜 작성 완료 (ABN-01~08, 03-01-PLAN.md + 03-02-PLAN.md)*
