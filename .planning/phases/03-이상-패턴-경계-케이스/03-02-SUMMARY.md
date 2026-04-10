---
phase: 03-이상-패턴-경계-케이스
plan: "02"
subsystem: booking-e2e
tags: [e2e, abnormal-pattern, session-expiry, seat-manipulation, booking]
dependency_graph:
  requires: [ABN-01, ABN-02, ABN-03, ABN-04]
  provides: [ABN-05, ABN-06, ABN-07, ABN-08]
  affects: [back/test/booking-abnormal.e2e-spec.ts]
tech_stack:
  added: []
  patterns: [진단 후 단언 고정, E2E 이상 패턴 테스트, Redis 직접 조작으로 세션 만료 시뮬레이션]
key_files:
  created: []
  modified:
    - back/test/booking-abnormal.e2e-spec.ts
decisions:
  - ABN-07 단언 수정: 이미 취소된 좌석 재취소 → 409가 아닌 400 반환 (validateAndRemoveBookedSeat가 updateSeatDeleted보다 먼저 실행)
  - ABN-05 단언: WAITING 상태 좌석 점유 → USER_LEVEL 가드(401) 정상 동작 확인
  - ABN-06 단언: redis.del 후 SID 무효화 → ForbiddenException(403) 정상 동작 확인
  - ABN-08 단언: bookingAmount(1) 초과 좌석 점유 → BadRequestException(400) 정상 동작 확인
metrics:
  duration: 약 3분
  completed_date: "2026-04-10T03:32:50Z"
  tasks_completed: 2
  files_changed: 1
---

# Phase 03 Plan 02: 이상 패턴 E2E 테스트 (ABN-05~08) Summary

**한 줄 요약:** 만료 세션 접근(403), WAITING 상태 권한 부족(401), 취소된 좌석 재취소(400), bookingAmount 초과 좌석 점유(400) 4개 이상 패턴을 E2E 테스트로 고정

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | ABN-05/06 describe 블록 추가 (만료 세션 & 권한 부족) | c62bffd | back/test/booking-abnormal.e2e-spec.ts |
| 2 | ABN-07/08 it 블록 추가 + 전체 테스트 그린 확인 | 0a47d03 | back/test/booking-abnormal.e2e-spec.ts |

## Test Results

```
PASS test/booking-abnormal.e2e-spec.ts (8.365 s)
  이상 패턴 & 경계 케이스 (booking-abnormal)
    상태 점프 & 중복 요청 이상 패턴
      √ ABN-01: ENTERING 상태에서 중복 permission → 기존 상태 유지 (245 ms)
      √ ABN-02: SELECTING_SEAT 중 다른 이벤트 permission → 실제 동작 고정 (225 ms)
      √ ABN-03: setBookingCount 없이 SELECTING_SEAT 진입 후 좌석 점유 → 400 (210 ms)
      √ ABN-04: 예매 완료 후 동일 이벤트 permission 재요청 → 200 반환 (234 ms)
    만료 세션 & 잘못된 상태 좌석 조작 이상 패턴
      √ ABN-05: WAITING_QUEUE 상태에서 좌석 점유 시도 → 401 (345 ms)
      √ ABN-06: 만료/무효 SID로 booking API 호출 → 403 (212 ms)
      √ ABN-07: 이미 취소된(deleted) 좌석을 다시 취소 → 400 (223 ms)
      √ ABN-08: bookingAmount(1) 초과 좌석 점유 시도 → 400 (211 ms)

Tests: 8 passed, 8 total
```

## ABN-07 진단 결과

- **예상 응답:** 409 (ConflictException — `updateSeatDeleted` → `runUpdateSeatLua` → result=0)
- **실제 응답:** 400 (BadRequestException)
- **원인:** `unBookSeat` 내부에서 `validateAndRemoveBookedSeat`가 먼저 호출됨. 첫 번째 취소 후 bookedSeats가 비어 있으므로 두 번째 취소 시도 시 `bookedSeats.length === 0` 조건으로 400을 반환하고 `updateSeatDeleted`에 도달하지 않음
- **조치:** 단언을 실제 동작(`toBe(400)`)으로 고정 (ABN-02와 동일한 진단 후 단언 고정 패턴)

## Decisions Made

1. **ABN-07 단언 수정:** `toBe(409)` → `toBe(400)` — `validateAndRemoveBookedSeat`가 `updateSeatDeleted`보다 먼저 실행되어 bookedSeats 검증에서 400이 발생
2. **ABN-05 구현:** maxSize=1로 슬롯을 채운 후 user2가 WAITING에 진입하는 ISO-01 패턴 재사용
3. **ABN-06 구현:** `getRedisService(app).getOrThrow().del('user:${sid}')` — Redis 직접 조작으로 세션 만료 시뮬레이션

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] ABN-07 단언 수정: 실제 상태 코드는 409가 아닌 400**
- **Found during:** Task 2 — 첫 번째 테스트 실행
- **Issue:** 계획서는 `updateSeatDeleted` → ConflictException(409) 경로를 기술했으나, 실제로는 `validateAndRemoveBookedSeat`에서 bookedSeats 비어있음으로 BadRequestException(400) 발생
- **Fix:** `expect(res.status).toBe(409)` → `expect(res.status).toBe(400)`으로 수정, 주석에 실제 실행 경로 명시
- **Files modified:** back/test/booking-abnormal.e2e-spec.ts
- **Commit:** 0a47d03

## Known Stubs

없음.

## Threat Flags

없음 — 이 Plan은 테스트 파일만 수정하며 새로운 네트워크 엔드포인트나 보안 경계를 도입하지 않음.

## Self-Check: PASSED

- [x] `back/test/booking-abnormal.e2e-spec.ts` 존재
- [x] 커밋 c62bffd 존재
- [x] 커밋 0a47d03 존재
- [x] 8개 테스트 모두 pass
