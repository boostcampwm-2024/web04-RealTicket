---
phase: 03
slug: 이상-패턴-경계-케이스
status: verified
threats_open: 0
asvs_level: 1
created: 2026-04-10
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| 테스트→앱 HTTP | supertest로 전송되는 요청 (SID 쿠키 위조 시나리오 포함) | SID 쿠키, HTTP 상태 코드 |
| 테스트→Redis 직접 조작 | ABN-06에서 `redis.del('user:${sid}')` — 세션 키 만료 시뮬레이션 | Redis 세션 키 |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01 | Elevation of Privilege | session.guard / USER_LEVEL | mitigate | ABN-05: WAITING(1)→SELECTING_SEAT(3) USER_LEVEL 가드가 401을 반환함을 E2E로 고정 | closed |
| T-03-02 | Tampering | isAdmission / setUserEventTarget | accept | ABN-02: SELECTING_SEAT 중 다른 이벤트 permission 시 targetEvent 덮어쓰기 동작을 테스트로 고정, 의도된 동작으로 문서화 | closed |
| T-03-03 | Denial of Service | InBookingService / validateAndAddBookedSeat | mitigate | ABN-03: bookingAmount=0 상태에서 좌석 점유 시도 시 400 반환으로 방어 코드 동작 확인 | closed |
| T-03-04 | Elevation of Privilege | session.guard / WAITING→SELECTING_SEAT | mitigate | ABN-05: USER_LEVEL 가드 401 반환 E2E 테스트로 회귀 방지 고정 (T-03-01과 동일 경계, Plan 02에서 재확인) | closed |
| T-03-05 | Spoofing | session.guard / 무효 SID | mitigate | ABN-06: `redis.del('user:${sid}')` 후 booking API 호출 → 403 반환 확인 — 세션 없는 요청 차단 동작 고정 | closed |
| T-03-06 | Tampering | BookingSeatsService / 좌석 상태 이중 취소 | mitigate | ABN-07: 이미 취소된 좌석 재취소 → 400 반환 (validateAndRemoveBookedSeat 방어 경로, REQUIREMENTS 허용 범위 내) | closed |
| T-03-07 | Tampering | InBookingService / bookingAmount 초과 | mitigate | ABN-08: bookingAmount(1) 초과 좌석 점유 시도 → 400 반환 확인 | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-02 | SELECTING_SEAT 중 다른 이벤트 permission 요청 시 targetEvent 덮어쓰기는 서버의 의도된 동작. 기존 예매 세션 포기 + 새 이벤트 진입. ABN-02 테스트로 동작 고정. 별도 방어 코드 불필요. | 팀 (UAT 승인) | 2026-04-10 |
| AR-03-02 | T-03-06 | ABN-07: validateAndRemoveBookedSeat(400) 경로가 의도된 방어 경로임을 팀이 확인. updateSeatDeleted(409) 경로는 현재 흐름에서 도달 불가. REQUIREMENTS.md '409 또는 일관된 에러' 범위 내 400 허용. | 팀 (UAT 승인) | 2026-04-10 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-04-10 | 7 | 7 | 0 | Claude (gsd-security-auditor 대체 — 모든 위협이 E2E 테스트로 검증됨) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-04-10
