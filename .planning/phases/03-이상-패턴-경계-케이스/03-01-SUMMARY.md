---
phase: 03-이상-패턴-경계-케이스
plan: "01"
subsystem: booking-e2e
tags: [e2e, abnormal-pattern, state-machine, booking]
dependency_graph:
  requires: []
  provides: [ABN-01, ABN-02, ABN-03, ABN-04]
  affects: [back/test/booking-abnormal.e2e-spec.ts]
tech_stack:
  added: []
  patterns: [진단 후 단언 고정, E2E 이상 패턴 테스트]
key_files:
  created:
    - back/test/booking-abnormal.e2e-spec.ts
  modified: []
decisions:
  - ABN-01 단언: ENTERING 상태에서 중복 permission → zadd 멱등 처리로 ENTERING 유지 (toBe 고정)
  - ABN-02 단언: SELECTING_SEAT 중 다른 이벤트 permission → 200 반환, targetEvent=eventId2로 덮어씀
metrics:
  duration: 약 4분
  completed_date: "2026-04-09T18:27:37Z"
  tasks_completed: 2
  files_changed: 1
---

# Phase 03 Plan 01: 이상 패턴 E2E 테스트 (ABN-01~04) Summary

**한 줄 요약:** ENTERING 중복 요청, SELECTING_SEAT 중 다른 이벤트 진입, bookingAmount=0 좌석 점유, 예매 완료 후 재진입 등 4개 이상 패턴을 E2E 테스트로 고정

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | booking-abnormal.e2e-spec.ts 파일 생성 + ABN-01/02 describe 블록 | 5c22221 | back/test/booking-abnormal.e2e-spec.ts |
| 2 | ABN-03/04 describe 블록 추가 + 단언 확정 | 5c22221 | back/test/booking-abnormal.e2e-spec.ts |

## Test Results

```
PASS test/booking-abnormal.e2e-spec.ts (7.171 s)
  이상 패턴 & 경계 케이스 (booking-abnormal)
    상태 점프 & 중복 요청 이상 패턴
      ✓ ABN-01: ENTERING 상태에서 중복 permission → 기존 상태 유지
      ✓ ABN-02: SELECTING_SEAT 중 다른 이벤트 permission → 실제 동작 고정
      ✓ ABN-03: setBookingCount 없이 SELECTING_SEAT 진입 후 좌석 점유 → 400
      ✓ ABN-04: 예매 완료 후 동일 이벤트 permission 재요청 → 200 반환

Tests: 4 passed, 4 total
```

## ABN-02 진단 결과

- **실제 응답 상태 코드:** 200
- **동작:** `isAdmission` → `setUserEventTarget(sid, eventId2)` 호출로 targetEvent가 eventId2로 덮어씀
- **이후 상태:** ENTERING (getForwarded → isInsertable=true → addEnteringSession → setUserStatusEntering)
- **의미:** SELECTING_SEAT 중인 유저가 다른 이벤트 permission을 요청하면 기존 이벤트의 예매 세션을 포기하고 새 이벤트로 전환됨 (T-03-02: 의도된 덮어쓰기 동작으로 문서화)

## ABN-01 실제 상태 전이 결과

- **실제 상태:** ENTERING 유지 (toBe('ENTERING')으로 고정)
- **이유:** `enterBookingService.addEnteringSession`이 Redis `zadd`를 사용 → 동일 sid는 타임스탬프만 갱신(멱등). entering pool의 카운트는 변하지 않으므로 isInsertable이 true → 재진입 시에도 ENTERING 상태 유지

## Decisions Made

1. **ABN-01 단언 고정:** `toBe('ENTERING')` — 중복 permission 요청 시 zadd 멱등 처리로 상태 유지
2. **ABN-02 단언 고정:** `expect(res.status).toBe(200)` + `expect(afterSession.targetEvent).toBe(eventId2)` — targetEvent 덮어쓰기 동작 고정
3. **Task 1+2 단일 커밋:** Task 1에서 ABN-03/04를 포함한 완성 파일을 생성하고 단일 커밋으로 처리

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] loginId 대소문자 규칙 위반 수정**
- **Found during:** Task 1 — 첫 번째 테스트 실행
- **Issue:** `abn02userA`에 대문자 'A'가 포함되어 `/^[a-z0-9]+$/` 정규식 검증 실패 → 회원가입 400 반환
- **Fix:** `abn02userA` → `abn02usera`로 소문자 변경
- **Files modified:** back/test/booking-abnormal.e2e-spec.ts

**2. [Plan 구조 조정] Task 1과 Task 2를 통합하여 완성 파일 생성**
- **이유:** ABN-03/04를 별도 Task로 분리하지 않고 최초 파일 생성 시 모두 포함하여 단순화
- **효과:** 커밋 1개로 4개 테스트 모두 green 확인

## Known Stubs

없음.

## Threat Flags

없음 — 이 Plan은 테스트 파일만 추가하며 새로운 네트워크 엔드포인트나 보안 경계를 도입하지 않음.

## Self-Check: PASSED

- [x] `back/test/booking-abnormal.e2e-spec.ts` 존재
- [x] 커밋 5c22221 존재
- [x] 4개 테스트 모두 pass
