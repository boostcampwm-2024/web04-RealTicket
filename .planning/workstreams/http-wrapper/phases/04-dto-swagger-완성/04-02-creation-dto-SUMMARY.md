---
phase: "04-dto-swagger-완성"
plan: "02"
subsystem: "back/domains"
tags: [swagger, dto, api-property, nestjs]
dependency_graph:
  requires: []
  provides:
    - EventCreationDto with @ApiProperty on all 4 fields
    - PlaceCreationDto with @ApiProperty on all 6 fields
    - ProgramCreationDto with @ApiProperty on all 7 fields
  affects:
    - Plan 03 (event/place/program controller @ApiBody 전환 시 Swagger 스키마 표시)
tech_stack:
  added: []
  patterns:
    - "@ApiProperty on DTO fields (Swagger schema generation)"
    - "import/order: external packages alphabetical (@nestjs/swagger before class-validator)"
key_files:
  created: []
  modified:
    - back/src/domains/event/dto/eventCreation.dto.ts
    - back/src/domains/place/dto/placeCreation.dto.ts
    - back/src/domains/program/dto/programCreation.dto.ts
decisions:
  - "@ApiProperty를 각 필드의 첫 번째 데코레이터 위치에 배치 (Swagger 스캔 관례)"
  - "import 순서: @nestjs/swagger → class-transformer(event만) → class-validator (ESLint import/order 준수)"
metrics:
  duration: "~5 minutes"
  completed: "2026-04-19"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 04 Plan 02: Creation DTO Swagger 문서화 Summary

EventCreationDto(4개), PlaceCreationDto(6개), ProgramCreationDto(7개) 전체 필드에 `@ApiProperty` 데코레이터 추가 — Plan 03의 `@ApiBody({ type: XxxCreationDto })` 전환 시 Swagger UI 요청 스키마 표시를 위한 선행 작업 완료.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | EventCreationDto에 @ApiProperty 추가 | fb5dfd7 | back/src/domains/event/dto/eventCreation.dto.ts |
| 2 | PlaceCreationDto @ApiProperty 추가 | 21fd237 | back/src/domains/place/dto/placeCreation.dto.ts |
| 2 | ProgramCreationDto @ApiProperty 추가 | 9dfb991 | back/src/domains/program/dto/programCreation.dto.ts |

## Changes Made

### EventCreationDto (`eventCreation.dto.ts`)
- `import { ApiProperty } from '@nestjs/swagger'` 추가 (첫 번째 import)
- 4개 필드에 `@ApiProperty` 추가:
  - `runningDate`: `format: 'date-time'`, `example: '2024-11-18T01:00:00Z'`
  - `reservationOpenDate`: `format: 'date-time'`, `example: '2024-11-16T01:00:00Z'`
  - `reservationCloseDate`: `format: 'date-time'`, `example: '2024-11-17T01:00:00Z'`
  - `programId`: `type: 'number'`, `example: 1`

### PlaceCreationDto (`placeCreation.dto.ts`)
- `import { ApiProperty } from '@nestjs/swagger'` 추가 (첫 번째 import)
- 6개 필드에 `@ApiProperty` 추가:
  - `name`: `example: '대극장'`
  - `address`: `example: '서울특별시'`
  - `overviewSvg`: `example: '/overview.svg'`
  - `overviewHeight`: `example: 1000`
  - `overviewWidth`: `example: 1500`
  - `overviewPoints`: `example: '{"x":200,"y":300}'`

### ProgramCreationDto (`programCreation.dto.ts`)
- `import { ApiProperty } from '@nestjs/swagger'` 추가 (첫 번째 import)
- 7개 필드에 `@ApiProperty` 추가:
  - `name`: `example: '맘마미아'`
  - `profileUrl`: `example: '/profile.png'`
  - `runningTime`: `example: 10000`
  - `genre`: `example: '뮤지컬'`
  - `actors`: `example: '김동현, 김동현'`
  - `price`: `example: 15000`
  - `placeId`: `example: 1`

## Deviations from Plan

None - 플랜에 명시된 내용 그대로 실행.

## Known Stubs

None.

## Threat Flags

None - DTO 파일에 데코레이터 추가만이며, example 값은 공개 API 문서 범위로 실제 secret 없음.

## Self-Check: PASSED

- [x] `back/src/domains/event/dto/eventCreation.dto.ts` 존재 및 @ApiProperty 4개 확인
- [x] `back/src/domains/place/dto/placeCreation.dto.ts` 존재 및 @ApiProperty 6개 확인
- [x] `back/src/domains/program/dto/programCreation.dto.ts` 존재 및 @ApiProperty 7개 확인
- [x] 커밋 fb5dfd7, 21fd237, 9dfb991 존재 확인
- [x] TypeScript 컴파일 에러 없음
