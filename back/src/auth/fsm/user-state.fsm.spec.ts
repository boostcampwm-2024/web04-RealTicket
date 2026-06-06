import { USER_STATUS as compatUserStatus } from '../const/userStatus.const';

import {
  BOOKING_USER_STATES,
  USER_STATE_TRANSITIONS,
  USER_STATUS as fsmUserStatus,
  canAccessState,
  enterBookingGate,
  enterWaiting,
  getAllowedTransitions,
  getUserStateTransitionTarget,
  markReconnectingSelection,
  resetToLogin,
  restoreSeatSelection,
  startSeatSelection,
  transitionUserState,
  type SessionUserStatus,
  type UserStateTransitionAction,
} from './user-state.fsm';

const USER_STATUS = fsmUserStatus;

const namedTransitions: Record<UserStateTransitionAction, (current: SessionUserStatus | string) => unknown> =
  {
    enterWaiting,
    enterBookingGate,
    startSeatSelection,
    markReconnectingSelection,
    restoreSeatSelection,
    resetToLogin,
  };

describe('사용자 상태 FSM', () => {
  it('영속 상태 문자열을 FSM 원천에서 그대로 내보냄', () => {
    expect(USER_STATUS).toEqual({
      LOGIN: 'LOGIN',
      WAITING: 'WAITING',
      ENTERING: 'ENTERING',
      SELECTING_SEAT: 'SELECTING_SEAT',
      RECONNECTING_SELECTING: 'RECONNECTING_SELECTING',
    });
    expect(Object.values(USER_STATUS)).not.toContain('ADMIN');
    expect(BOOKING_USER_STATES).toEqual([
      USER_STATUS.LOGIN,
      USER_STATUS.WAITING,
      USER_STATUS.ENTERING,
      USER_STATUS.SELECTING_SEAT,
      USER_STATUS.RECONNECTING_SELECTING,
    ]);
    expect(BOOKING_USER_STATES).not.toContain('ADMIN');
  });

  it('기존 const 표면을 FSM 원천과 호환되게 유지함', () => {
    expect(compatUserStatus).toBe(fsmUserStatus);
    expect(compatUserStatus.SELECTING_SEAT).toBe('SELECTING_SEAT');
    expect(compatUserStatus.RECONNECTING_SELECTING).toBe('RECONNECTING_SELECTING');
  });

  it('허용된 전이 테이블만 정확히 노출함', () => {
    expect(getAllowedTransitions()).toBe(USER_STATE_TRANSITIONS);
    expect(getAllowedTransitions()).toEqual([
      { action: 'enterWaiting', from: USER_STATUS.LOGIN, to: USER_STATUS.WAITING },
      { action: 'enterBookingGate', from: USER_STATUS.LOGIN, to: USER_STATUS.ENTERING },
      { action: 'enterBookingGate', from: USER_STATUS.WAITING, to: USER_STATUS.ENTERING },
      { action: 'startSeatSelection', from: USER_STATUS.ENTERING, to: USER_STATUS.SELECTING_SEAT },
      {
        action: 'markReconnectingSelection',
        from: USER_STATUS.SELECTING_SEAT,
        to: USER_STATUS.RECONNECTING_SELECTING,
      },
      {
        action: 'restoreSeatSelection',
        from: USER_STATUS.RECONNECTING_SELECTING,
        to: USER_STATUS.SELECTING_SEAT,
      },
      { action: 'resetToLogin', from: USER_STATUS.WAITING, to: USER_STATUS.LOGIN },
      { action: 'resetToLogin', from: USER_STATUS.ENTERING, to: USER_STATUS.LOGIN },
      { action: 'resetToLogin', from: USER_STATUS.SELECTING_SEAT, to: USER_STATUS.LOGIN },
      { action: 'resetToLogin', from: USER_STATUS.RECONNECTING_SELECTING, to: USER_STATUS.LOGIN },
    ]);
  });

  it.each(getAllowedTransitions())('$action 전이는 $from에서 $to로 이동함', ({ action, from, to }) => {
    expect(transitionUserState(action, from)).toEqual({ ok: true, action, from, to });
    expect(namedTransitions[action](from)).toEqual({ ok: true, action, from, to });
  });

  it.each([
    ['enterWaiting', USER_STATUS.WAITING],
    ['enterBookingGate', USER_STATUS.ENTERING],
    ['startSeatSelection', USER_STATUS.SELECTING_SEAT],
    ['markReconnectingSelection', USER_STATUS.RECONNECTING_SELECTING],
    ['restoreSeatSelection', USER_STATUS.SELECTING_SEAT],
    ['resetToLogin', USER_STATUS.LOGIN],
  ] as const)('%s 전이의 기본 도착 상태를 제공함', (action, to) => {
    expect(getUserStateTransitionTarget(action)).toBe(to);
  });

  it.each([
    ['startSeatSelection', USER_STATUS.LOGIN, USER_STATUS.SELECTING_SEAT],
    ['startSeatSelection', USER_STATUS.WAITING, USER_STATUS.SELECTING_SEAT],
    ['enterBookingGate', USER_STATUS.SELECTING_SEAT, USER_STATUS.ENTERING],
    ['restoreSeatSelection', USER_STATUS.SELECTING_SEAT, USER_STATUS.SELECTING_SEAT],
    ['resetToLogin', USER_STATUS.LOGIN, USER_STATUS.LOGIN],
  ] as const)('%s 전이는 %s 시작 상태를 거부함', (action, from, to) => {
    expect(transitionUserState(action, from)).toEqual({
      ok: false,
      action,
      from,
      to,
      reason: 'INVALID_TRANSITION',
    });
  });

  it('오래된 ADMIN 저장 상태를 알 수 없는 상태로 취급함', () => {
    expect(transitionUserState('enterBookingGate', 'ADMIN')).toEqual({
      ok: false,
      action: 'enterBookingGate',
      from: 'ADMIN',
      to: USER_STATUS.ENTERING,
      reason: 'UNKNOWN_STATE',
    });
  });

  it('알 수 없는 저장 상태를 변환하지 않고 거부함', () => {
    expect(transitionUserState('enterWaiting', 'BROKEN_STATE')).toEqual({
      ok: false,
      action: 'enterWaiting',
      from: 'BROKEN_STATE',
      to: USER_STATUS.WAITING,
      reason: 'UNKNOWN_STATE',
    });
  });

  it('명시된 상태 집합 포함 여부로 접근 가능 상태를 판단함', () => {
    expect(canAccessState(USER_STATUS.SELECTING_SEAT, USER_STATUS.LOGIN)).toBe(false);
    expect(canAccessState(USER_STATUS.SELECTING_SEAT, USER_STATUS.SELECTING_SEAT)).toBe(true);
    expect(
      canAccessState(USER_STATUS.SELECTING_SEAT, [USER_STATUS.ENTERING, USER_STATUS.SELECTING_SEAT]),
    ).toBe(true);
    expect(
      canAccessState(USER_STATUS.RECONNECTING_SELECTING, [USER_STATUS.WAITING, USER_STATUS.ENTERING]),
    ).toBe(false);
  });
});
