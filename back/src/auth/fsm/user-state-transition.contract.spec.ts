import { readFileSync } from 'fs';
import { join } from 'path';

import {
  type TargetEventPatch,
  buildLuaUserStateTransitionInput,
  mapLuaUserStateTransitionResult,
  type LuaUserStateTransitionCode,
} from './user-state-transition.contract';
import { USER_STATUS, getAllowedTransitions } from './user-state.fsm';

const baseFailureCodes = [
  'SESSION_MISSING',
  'STATE_MISMATCH',
  'TARGET_EVENT_MISMATCH',
  'SESSION_EXPIRED_DURING_WRITE',
] as const satisfies readonly LuaUserStateTransitionCode[];

describe('Lua 사용자 상태 전이 계약', () => {
  it('계약 모듈은 프레임워크와 저장소 의존성을 가져오지 않음', () => {
    const source = readFileSync(join(__dirname, 'user-state-transition.contract.ts'), 'utf8');

    expect(source).not.toMatch(/@nestjs|Redis|ioredis|AuthService|BookingService/);
  });

  it('targetEvent patch 모드를 명시적으로 정의함', () => {
    const patches = [
      { mode: 'set', eventId: 12 },
      { mode: 'preserve' },
      { mode: 'clear' },
    ] as const satisfies readonly TargetEventPatch[];

    expect(patches).toEqual([{ mode: 'set', eventId: 12 }, { mode: 'preserve' }, { mode: 'clear' }]);
  });

  it('TypeScript FSM 결과로 Lua 전이 입력을 생성함', () => {
    expect(
      buildLuaUserStateTransitionInput({
        sid: 'sid-1',
        action: 'enterWaiting',
        expectedFrom: USER_STATUS.LOGIN,
        targetEventPatch: { mode: 'set', eventId: 1 },
        expectedTargetEvent: null,
      }),
    ).toMatchObject({
      sessionKey: expect.any(String),
      action: 'enterWaiting',
      expectedFrom: USER_STATUS.LOGIN,
      nextTo: USER_STATUS.WAITING,
      targetEventPatch: { mode: 'set', eventId: 1 },
      expectedTargetEvent: null,
    });
  });

  it('Lua 입력 생성 전 기존 의미 전이 실패를 그대로 반환함', () => {
    expect(
      buildLuaUserStateTransitionInput({
        sid: 'sid-1',
        action: 'startSeatSelection',
        expectedFrom: USER_STATUS.LOGIN,
        targetEventPatch: { mode: 'preserve' },
      }),
    ).toEqual({
      ok: false,
      action: 'startSeatSelection',
      from: USER_STATUS.LOGIN,
      to: USER_STATUS.SELECTING_SEAT,
      reason: 'INVALID_TRANSITION',
    });
  });

  it('expectedFrom을 생략하면 현재 상태 검증 없이 resetToLogin 입력을 생성함', () => {
    expect(
      buildLuaUserStateTransitionInput({
        sid: 'sid-1',
        action: 'resetToLogin',
        targetEventPatch: { mode: 'clear' },
        expectedTargetEvent: 7,
      }),
    ).toEqual({
      sessionKey: 'user:sid-1',
      action: 'resetToLogin',
      nextTo: USER_STATUS.LOGIN,
      targetEventPatch: { mode: 'clear' },
      expectedTargetEvent: 7,
    });
  });

  it('expectedFrom을 생략해도 LOGIN 대상이 아닌 전이의 nextTo를 FSM에서 도출함', () => {
    expect(
      buildLuaUserStateTransitionInput({
        sid: 'sid-1',
        action: 'startSeatSelection',
        targetEventPatch: { mode: 'preserve' },
      }),
    ).toEqual({
      sessionKey: 'user:sid-1',
      action: 'startSeatSelection',
      nextTo: USER_STATUS.SELECTING_SEAT,
      targetEventPatch: { mode: 'preserve' },
      expectedTargetEvent: undefined,
    });
  });

  it('OK Lua 원시 응답을 성공 전이 결과로 매핑함', () => {
    expect(
      mapLuaUserStateTransitionResult(['OK'], {
        action: 'enterWaiting',
        expectedFrom: USER_STATUS.LOGIN,
        nextTo: USER_STATUS.WAITING,
      }),
    ).toEqual({
      ok: true,
      code: 'OK',
      action: 'enterWaiting',
      from: USER_STATUS.LOGIN,
      to: USER_STATUS.WAITING,
    });
  });

  it('expectedFrom 없이 OK Lua 원시 응답을 성공 전이 결과로 매핑함', () => {
    expect(
      mapLuaUserStateTransitionResult(['OK'], {
        action: 'resetToLogin',
        nextTo: USER_STATUS.LOGIN,
      }),
    ).toEqual({
      ok: true,
      code: 'OK',
      action: 'resetToLogin',
      to: USER_STATUS.LOGIN,
    });
  });

  it.each(baseFailureCodes)('기본 fail-closed 결과 코드 %s를 예외 없이 변환함', (code) => {
    expect(
      mapLuaUserStateTransitionResult([code, 'detail'], {
        action: 'enterWaiting',
        expectedFrom: USER_STATUS.LOGIN,
        nextTo: USER_STATUS.WAITING,
      }),
    ).toEqual({
      ok: false,
      code,
      action: 'enterWaiting',
      expectedFrom: USER_STATUS.LOGIN,
      nextTo: USER_STATUS.WAITING,
      details: ['detail'],
    });
  });

  it('호출자가 선언한 경로별 비즈니스 결과 코드 확장을 허용함', () => {
    expect(
      mapLuaUserStateTransitionResult(['CAPACITY_FULL'], {
        action: 'enterBookingGate',
        expectedFrom: USER_STATUS.LOGIN,
        nextTo: USER_STATUS.ENTERING,
        businessCodes: ['CAPACITY_FULL'],
      }),
    ).toMatchObject({
      ok: false,
      code: 'CAPACITY_FULL',
    });
  });

  it('선언되지 않은 비기본 코드는 스크립트 계약 실패로 거부함', () => {
    expect(() =>
      mapLuaUserStateTransitionResult(['UNDECLARED_CODE'], {
        action: 'enterWaiting',
        expectedFrom: USER_STATUS.LOGIN,
        nextTo: USER_STATUS.WAITING,
      }),
    ).toThrow('Unknown Lua user state transition code');
  });

  it('제거된 malformed-session 코드는 선언되지 않은 계약 실패로 거부함', () => {
    const removedMalformedSessionCode = `MALFORMED_${'SESSION'}` as LuaUserStateTransitionCode;

    expect(() =>
      mapLuaUserStateTransitionResult([removedMalformedSessionCode], {
        action: 'enterWaiting',
        expectedFrom: USER_STATUS.LOGIN,
        nextTo: USER_STATUS.WAITING,
      }),
    ).toThrow('Unknown Lua user state transition code');
  });

  it.each(getAllowedTransitions())('$action 전이에 대해 $from에서 $to로 가는 Lua 입력을 정확히 도출함', (row) => {
    expect(
      buildLuaUserStateTransitionInput({
        sid: 'sid-1',
        action: row.action,
        expectedFrom: row.from,
        targetEventPatch: { mode: 'preserve' },
      }),
    ).toMatchObject({
      sessionKey: 'user:sid-1',
      action: row.action,
      expectedFrom: row.from,
      nextTo: row.to,
      targetEventPatch: { mode: 'preserve' },
    });
  });

  it('즉시 입장과 대기열 선두 입장을 위한 enterBookingGate 시작 상태를 정확히 지원함', () => {
    expect(
      buildLuaUserStateTransitionInput({
        sid: 'immediate-sid',
        action: 'enterBookingGate',
        expectedFrom: USER_STATUS.LOGIN,
        targetEventPatch: { mode: 'set', eventId: 10 },
      }),
    ).toMatchObject({
      sessionKey: 'user:immediate-sid',
      expectedFrom: USER_STATUS.LOGIN,
      nextTo: USER_STATUS.ENTERING,
    });

    expect(
      buildLuaUserStateTransitionInput({
        sid: 'waiting-head-sid',
        action: 'enterBookingGate',
        expectedFrom: USER_STATUS.WAITING,
        targetEventPatch: { mode: 'set', eventId: 10 },
      }),
    ).toMatchObject({
      sessionKey: 'user:waiting-head-sid',
      expectedFrom: USER_STATUS.WAITING,
      nextTo: USER_STATUS.ENTERING,
    });
  });

  it.each([
    ['startSeatSelection', USER_STATUS.LOGIN, USER_STATUS.SELECTING_SEAT, 'INVALID_TRANSITION'],
    ['enterBookingGate', USER_STATUS.SELECTING_SEAT, USER_STATUS.ENTERING, 'INVALID_TRANSITION'],
    ['enterWaiting', 'BROKEN_STATE', USER_STATUS.WAITING, 'UNKNOWN_STATE'],
  ] as const)('Lua 입력 생성 전 잘못된 시작 상태 %s / %s를 거부함', (action, from, to, reason) => {
    expect(
      buildLuaUserStateTransitionInput({
        sid: 'sid-1',
        action,
        expectedFrom: from,
        targetEventPatch: { mode: 'preserve' },
      }),
    ).toEqual({
      ok: false,
      action,
      from,
      to,
      reason,
    });
  });
});
