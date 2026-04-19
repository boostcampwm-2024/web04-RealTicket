---
phase: "04-dto-swagger-완성"
plan: "04"
subsystem: "back/src/domains (reservation, booking, user)"
tags: [swagger, dto, allOf, getSchemaPath, controller]
dependency_graph:
  requires:
    - "04-01 (SuccessResponseDto, ErrorResponseDto 생성)"
  provides:
    - "reservation.controller.ts — envelope 기반 Swagger 응답 스키마"
    - "booking.controller.ts — SSE 제외 envelope 패턴"
    - "user.controller.ts — envelope 기반 Swagger 응답 스키마"
  affects:
    - "Swagger UI /api 문서"
tech_stack:
  added: []
  patterns:
    - "allOf + getSchemaPath(SuccessResponseDto) envelope 패턴"
    - "ApiExtraModels로 스키마 레지스트리 등록"
    - "SSE 엔드포인트는 기존 type: WaitingSseDto/SeatsSseDto 방식 유지"
key_files:
  created: []
  modified:
    - back/src/domains/reservation/controller/reservation.controller.ts
    - back/src/domains/booking/controller/booking.controller.ts
    - back/src/domains/user/controller/user.controller.ts
decisions:
  - "reservation.controller.ts는 src/ alias import 사용 (기존 파일의 import 패턴 따름)"
  - "booking.controller.ts, user.controller.ts는 ../../../ 상대 경로 import 사용 (기존 파일의 import 패턴 따름)"
  - "SSE 엔드포인트 2개(subscribeWaitingQueue, getReservationStatusByEventId)는 D-06 결정에 따라 기존 방식 유지"
metrics:
  duration: "약 10분"
  completed: "2026-04-19"
  tasks_completed: 3
  files_modified: 3
---

# Phase 04 Plan 04: reservation/booking/user 컨트롤러 Swagger 응답 업데이트 Summary

reservation, booking, user 3개 컨트롤러에 allOf+getSchemaPath 패턴 적용하여 SuccessResponseDto/ErrorResponseDto 기반 Swagger envelope 응답 스키마 완성.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | reservation.controller.ts @ApiResponse 업데이트 | c8b6af2 | back/src/domains/reservation/controller/reservation.controller.ts |
| 2 | booking.controller.ts SSE 제외 @ApiResponse 업데이트 | d41f6e7 | back/src/domains/booking/controller/booking.controller.ts |
| 3 | user.controller.ts @ApiResponse 업데이트 | 5e3a08f | back/src/domains/user/controller/user.controller.ts |

## What Was Built

### Task 1: reservation.controller.ts
- `findReservation` (GET /): 배열 반환 — `type: 'array', items: { $ref: getSchemaPath(ReservationSpecificDto) }`
- `deleteReservation` (DELETE :reservationId): nullable data 반환
- `createReservation` (POST /): `$ref: getSchemaPath(ReservationResultDto)`
- `RESERVATION_NOT_FOUND | RESERVATION_FORBIDDEN` 에러 코드 문서화
- import: `src/common/dto/` alias 방식

### Task 2: booking.controller.ts
- SSE 엔드포인트 2개 (`GET re-permission/:eventId`, `GET seat/:eventId`) 기존 `type: WaitingSseDto/SeatsSseDto` 방식 그대로 유지 (D-06)
- 나머지 8개 엔드포인트 allOf 패턴 적용:
  - `setBookingAmount` → BookingAmountResDto
  - `updateSeatOccupancy` → BookResDto + `SEAT_ALREADY_OCCUPIED | SEAT_NOT_OCCUPIED`
  - `getServerTime` → ServerTimeDto
  - `setInBookingSessionsMaxSize`, `setAllInBookingSessionsMaxSize`, `setInBookingSessionsDefaultMaxSize` → InBookingSizeResDto
  - `reloadOpenTarget`, `initReservation` → nullable data
- import: `../../../common/dto/` 상대 경로 방식

### Task 3: user.controller.ts
- 7개 엔드포인트 allOf 패턴 적용:
  - `signup`, `signupForAdmin` → message 객체 + `USER_ALREADY_EXISTS`
  - `useGuestMode` → 빈 객체 + `USER_GUEST_CREATE_FAILED`
  - `login` → `{ login_id: string }` + `AUTH_INVALID_CREDENTIALS`
  - `checkid` → `{ available: boolean }`
  - `logout` → nullable data + `AUTH_FORBIDDEN`
  - `getUserInfo` → nullable data + `COMMON_UNKNOWN_ERROR`
- import: `../../../common/dto/` 상대 경로 방식

## Deviations from Plan

없음 — 플랜 그대로 실행됨.

## Known Stubs

없음.

## Threat Flags

없음 — Swagger 문서 레이어 변경만으로 런타임 동작 무변경.

## Self-Check: PASSED

- [x] `back/src/domains/reservation/controller/reservation.controller.ts` 존재 및 allOf: 3회
- [x] `back/src/domains/booking/controller/booking.controller.ts` 존재 및 allOf: 8회, SSE 보존
- [x] `back/src/domains/user/controller/user.controller.ts` 존재 및 allOf: 7회
- [x] 커밋 c8b6af2, d41f6e7, 5e3a08f 존재
