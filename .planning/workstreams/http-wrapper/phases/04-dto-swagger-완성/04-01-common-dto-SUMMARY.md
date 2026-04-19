---
phase: "04-dto-swagger-완성"
plan: "01"
subsystem: api
tags: [nestjs, swagger, dto, typescript]

# Dependency graph
requires: []
provides:
  - "SuccessResponseDto<T = unknown>: success 필드에만 @ApiProperty, data: T 필드는 @ApiProperty 없음"
  - "ErrorDetailDto: code(string), message(string) 필드에 @ApiProperty 적용"
  - "ErrorResponseDto: success, error(ErrorDetailDto) 필드에 @ApiProperty 적용"
  - "back/src/common/dto/ 디렉토리 신규 생성"
affects:
  - "04-02-creation-dto"
  - "04-03-event-place-program-controller"
  - "04-04-reservation-booking-user-controller"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SuccessResponseDto<T>의 data 필드는 @ApiProperty 제외 (allOf로 컨트롤러 단에서 표현)"
    - "ErrorDetailDto + ErrorResponseDto 2-클래스 구조로 에러 응답 포맷 표현"

key-files:
  created:
    - back/src/common/dto/success-response.dto.ts
    - back/src/common/dto/error-response.dto.ts
  modified: []

key-decisions:
  - "D-02: SuccessResponseDto<T>의 success 필드에만 @ApiProperty 적용, data 필드는 제외"
  - "D-03: ErrorDetailDto + ErrorResponseDto 2-클래스 구조 사용"
  - "D-04: ErrorDetailDto.code 필드는 string 타입만 (enum 배열 나열 안 함)"
  - "D-05: back/src/common/dto/ 신규 디렉토리에 파일 생성"

patterns-established:
  - "SuccessResponseDto allOf 패턴: data: T 필드는 @ApiProperty 없이 컨트롤러 단 getSchemaPath로 표현"
  - "에러 응답: { success: false, error: { code, message } } 포맷을 ErrorDetailDto + ErrorResponseDto로 타입화"

requirements-completed:
  - DTO-03

# Metrics
duration: 5min
completed: "2026-04-19"
---

# Phase 04 Plan 01: Common DTO Summary

**`SuccessResponseDto<T>` + `ErrorDetailDto`/`ErrorResponseDto` 공용 Swagger 응답 DTO를 back/src/common/dto/ 에 신규 생성, allOf 패턴과 2-클래스 에러 구조로 이후 컨트롤러 Swagger 데코레이터의 기반 제공**

## Performance

- **Duration:** 약 5분
- **Started:** 2026-04-19T09:06:00Z
- **Completed:** 2026-04-19T09:11:20Z
- **Tasks:** 2
- **Files modified:** 2 (신규 생성)

## Accomplishments
- `back/src/common/dto/` 디렉토리 신규 생성
- `SuccessResponseDto<T = unknown>`: success 필드에만 `@ApiProperty({ example: true })` 적용, data 필드는 @ApiProperty 없음 (D-02 결정 준수)
- `ErrorDetailDto` + `ErrorResponseDto` 2-클래스 구조: global-exception.filter.ts의 에러 포맷 `{ success: false, error: { code, message } }` 정확히 반영

## Task Commits

Each task was committed atomically:

1. **Task 1: SuccessResponseDto 생성** - `8b7f128` (feat)
2. **Task 2: ErrorDetailDto + ErrorResponseDto 생성** - `ccd5f90` (feat)

**Plan metadata:** (docs commit 별도)

## Files Created/Modified
- `back/src/common/dto/success-response.dto.ts` - SuccessResponseDto<T = unknown> 제네릭 DTO, success 필드에만 @ApiProperty
- `back/src/common/dto/error-response.dto.ts` - ErrorDetailDto (code, message), ErrorResponseDto (success, error) 2-클래스 에러 응답 DTO

## Decisions Made
- D-02: `data: T` 필드에 @ApiProperty 없음 — allOf 패턴으로 컨트롤러 단에서 DataDto를 getSchemaPath로 표현하는 설계
- D-03: 2-클래스 구조 (ErrorDetailDto 내포) — Swagger 스키마에서 error 객체 구조를 명확히 표현
- D-04: code 필드는 string 타입만 — 엔드포인트마다 다른 에러 코드를 단일 enum으로 표현 불가

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `SuccessResponseDto`, `ErrorDetailDto`, `ErrorResponseDto` 모두 export 준비 완료
- Plan 04-02 (creation DTO @ApiProperty 추가), Plan 04-03, 04-04 (컨트롤러 @ApiResponse 업데이트)에서 이 두 파일을 import하여 사용 가능
- TypeScript 컴파일 오류 없음 확인

---
*Phase: 04-dto-swagger-완성*
*Completed: 2026-04-19*
