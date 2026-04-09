---
phase: 02-크로스-이벤트-격리
plan: "02"
subsystem: booking
tags: [cross-event, isolation, redis, e2e, bug-fix]
dependency_graph:
  requires: [02-01]
  provides: [ISO-03, ISO-04, ISO-05]
  affects: [EnterBookingService.clearEnteringPool, booking-cross-event.e2e-spec.ts]
tech_stack:
  added: []
  patterns: [TDD red-green, E2E integration test, Redis key scoped deletion]
key_files:
  created: []
  modified:
    - back/test/booking-cross-event.e2e-spec.ts
    - back/src/domains/booking/service/enter-booking.service.ts
decisions:
  - clearEnteringPool은 entering:* 와일드카드 대신 getAllEnteringSids(eventId)로 해당 이벤트 sid만 수집 후 개별 키 삭제
  - 예매 완료 후 세션 정리는 simulateSseDisconnect + simulateSseCloseTimeout 조합 사용 (onSeatsSseDisconnected 직접 호출 대신)
  - POST /reservation 으로 예매 저장 (계획상 /booking/save 는 존재하지 않음)
metrics:
  duration: "~15분"
  completed: "2026-04-09"
  tasks_completed: 2
  files_changed: 2
---

# Phase 02 Plan 02: clearEnteringPool 버그 수정 + ISO-03/04/05 E2E 테스트 Summary

이벤트 A 예매 완료 후 이벤트 B 격리 E2E 테스트(ISO-03, ISO-04) 추가 및 `clearEnteringPool`의 `entering:*` 와일드카드 삭제 버그 수정 + 회귀 테스트(ISO-05) 완료.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | ISO-03, ISO-04 이벤트 A 예매 완료 후 이벤트 B 격리 테스트 | f53a427 | back/test/booking-cross-event.e2e-spec.ts |
| 2 | ISO-05 clearEnteringPool 버그 수정 + 회귀 테스트 | fa9bec9 | back/src/domains/booking/service/enter-booking.service.ts, back/test/booking-cross-event.e2e-spec.ts |

## Verification Results

```
Tests: 5 passed (ISO-01, ISO-02, ISO-03, ISO-04, ISO-05)
전체 회귀: 102 passed, 9 suites (기존 99 → 102, 회귀 없음)
```

와일드카드 제거 확인:
```bash
grep -n "entering:\*" back/src/domains/booking/service/enter-booking.service.ts
# → 결과 없음 (정상)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] /booking/save 엔드포인트 존재하지 않음**
- **Found during:** Task 1 (ISO-03/04 테스트 작성)
- **Issue:** 계획에서 POST /booking/save로 예매 저장 API를 명시했으나, 실제로는 POST /reservation 엔드포인트를 사용
- **Fix:** booking.e2e-spec.ts에서 실제 패턴 확인 후 `/reservation` 엔드포인트로 수정, seats 배열 body 포함
- **Files modified:** back/test/booking-cross-event.e2e-spec.ts

**2. [Rule 1 - Bug] onSeatsSseDisconnected 직접 호출 대신 simulateSseDisconnect + simulateSseCloseTimeout 조합 사용**
- **Found during:** Task 1 (ISO-03/04 세션 정리 로직)
- **Issue:** 계획에서 onSeatsSseDisconnected 직접 호출을 제안했으나, 이는 in-booking 세션 정리를 올바르게 수행하지 않음. simulateSseCloseTimeout이 emitSession(이벤트 풀에서 제거) + 상태 LOGIN 복귀를 올바르게 처리함
- **Fix:** simulateSseDisconnect → simulateSseCloseTimeout 2단계 시퀀스 사용
- **Files modified:** back/test/booking-cross-event.e2e-spec.ts

## Known Stubs

없음.

## Threat Flags

없음 — 수정된 코드는 Redis 키 삭제 범위를 좁히는 보안 강화 변경이며, 새로운 attack surface 없음.

## Self-Check: PASSED

- back/test/booking-cross-event.e2e-spec.ts: 존재 확인
- back/src/domains/booking/service/enter-booking.service.ts: 존재 확인
- commit f53a427: 확인
- commit fa9bec9: 확인
- ISO-01~05 모두 PASS
- entering:* 와일드카드 제거 확인
