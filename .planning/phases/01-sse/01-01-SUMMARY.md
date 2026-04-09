---
phase: 01-sse
plan: 01
subsystem: booking-e2e
tags: [sse, reconnect, e2e-test, state-machine]
dependency_graph:
  requires: []
  provides: [simulateSSEReconnect-helper, SSE-reconnect-test-suite]
  affects: [back/test/helpers/e2e-setup.ts, back/test/booking-reconnect.e2e-spec.ts]
tech_stack:
  added: []
  patterns: [jest-e2e, supertest, service-direct-call]
key_files:
  created:
    - back/test/booking-reconnect.e2e-spec.ts
  modified:
    - back/test/helpers/e2e-setup.ts
decisions:
  - "simulateSSEReconnect 헬퍼는 컨트롤러 RECONNECTING_SELECTING 분기를 서비스 직접 호출로 재현"
  - "두 번째 유저의 setupSelectingSeat 대신 requestPermission/setBookingCount/transitionToSelectingSeat 개별 호출 (이미 오픈된 이벤트)"
metrics:
  duration: "약 10분"
  completed: "2026-04-09T09:34:55Z"
  tasks_completed: 2
  files_modified: 2
  requirements_satisfied: [SSE-01, SSE-02, SSE-05]
---

# Phase 1 Plan 1: SSE 재연결 상태 머신 Summary

## One-liner

RECONNECTING_SELECTING → SELECTING_SEAT 재연결 경로를 E2E 헬퍼와 2개 시나리오 테스트로 증명

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | simulateSSEReconnect 헬퍼 추가 | f077a77 | back/test/helpers/e2e-setup.ts |
| 2 | SSE 재연결 E2E 테스트 작성 | 654c5f8 | back/test/booking-reconnect.e2e-spec.ts |

## Artifacts

### simulateSSEReconnect 헬퍼 함수 시그니처

```typescript
// back/test/helpers/e2e-setup.ts
export async function simulateSSEReconnect(app: INestApplication, sid: string): Promise<void>
```

**동작:** `getUserEventTarget(sid)` → `removeReconnectingSession(eventId, sid)` → `setUserStatusSelectingSeat(sid)` 순서로 컨트롤러의 RECONNECTING_SELECTING 분기를 직접 재현한다.

### 통과된 테스트 목록

| 테스트명 | Requirements ID | 결과 |
|---------|----------------|------|
| SSE 끊김 후 타임아웃 내 재연결 → 세션 상태 SELECTING_SEAT 복구 | SSE-01 | PASS (298ms) |
| SSE 끊김 후 재연결 → 기존 점유 좌석 유지 + 다른 유저 동일 좌석 점유 불가 (409) | SSE-02 | PASS (499ms) |

### 테스트 실행 결과

```
PASS test/booking-reconnect.e2e-spec.ts (17.42 s)
  SSE 재연결 시나리오 (booking-reconnect)
    ✓ SSE 끊김 후 타임아웃 내 재연결 → 세션 상태 SELECTING_SEAT 복구 (298 ms)
    ✓ SSE 끊김 후 재연결 → 기존 점유 좌석 유지 + 다른 유저 동일 좌석 점유 불가 (409) (499 ms)

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
Time:        17.6 s
```

## Decisions Made

1. **simulateSSEReconnect 헬퍼 위치:** `simulateSseCloseTimeout` 바로 아래에 배치해 disconnect→reconnect→timeout 흐름이 코드상에서도 자연스럽게 읽히도록 함
2. **두 번째 유저 진입 방식:** 테스트 2에서 두 번째 유저는 이미 오픈된 이벤트에 진입하므로 `setupSelectingSeat`(내부에 `openEventReservation` 포함) 대신 `requestPermission + setBookingCount + transitionToSelectingSeat`를 개별 호출

## Deviations from Plan

없음 — 플랜이 명시한 대로 정확히 실행됨.

## Known Stubs

없음.

## Threat Flags

없음 — 테스트 전용 코드이며 프로덕션 노출 경로 없음.

## Self-Check: PASSED

- [x] `back/test/helpers/e2e-setup.ts` 에 `simulateSSEReconnect` export 존재
- [x] `back/test/booking-reconnect.e2e-spec.ts` 파일 존재
- [x] commit `f077a77` 존재 (Task 1)
- [x] commit `654c5f8` 존재 (Task 2)
- [x] Tests: 2 passed 확인됨
