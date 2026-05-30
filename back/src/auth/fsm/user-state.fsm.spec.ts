import { USER_STATUS as compatUserStatus } from '../const/userStatus.const';

import {
  BOOKING_USER_STATES,
  USER_STATE_TRANSITIONS,
  USER_STATUS as fsmUserStatus,
  canAccessState,
  enterBookingGate,
  enterWaiting,
  getAllowedTransitions,
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

describe('user-state FSM', () => {
  it('exports the persisted status strings from the FSM source of truth', () => {
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

  it('keeps the legacy const surface compatible with the FSM source', () => {
    expect(compatUserStatus).toBe(fsmUserStatus);
    expect(compatUserStatus.SELECTING_SEAT).toBe('SELECTING_SEAT');
    expect(compatUserStatus.RECONNECTING_SELECTING).toBe('RECONNECTING_SELECTING');
  });

  it('exposes exactly the allowed transition table', () => {
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

  it.each(getAllowedTransitions())('$action allows $from -> $to', ({ action, from, to }) => {
    expect(transitionUserState(action, from)).toEqual({ ok: true, action, from, to });
    expect(namedTransitions[action](from)).toEqual({ ok: true, action, from, to });
  });

  it.each([
    ['startSeatSelection', USER_STATUS.LOGIN, USER_STATUS.SELECTING_SEAT],
    ['startSeatSelection', USER_STATUS.WAITING, USER_STATUS.SELECTING_SEAT],
    ['enterBookingGate', USER_STATUS.SELECTING_SEAT, USER_STATUS.ENTERING],
    ['restoreSeatSelection', USER_STATUS.SELECTING_SEAT, USER_STATUS.SELECTING_SEAT],
    ['resetToLogin', USER_STATUS.LOGIN, USER_STATUS.LOGIN],
  ] as const)('%s rejects invalid transition from %s', (action, from, to) => {
    expect(transitionUserState(action, from)).toEqual({
      ok: false,
      action,
      from,
      to,
      reason: 'INVALID_TRANSITION',
    });
  });

  it('treats a stale ADMIN persisted state as unknown', () => {
    expect(transitionUserState('enterBookingGate', 'ADMIN')).toEqual({
      ok: false,
      action: 'enterBookingGate',
      from: 'ADMIN',
      to: USER_STATUS.ENTERING,
      reason: 'UNKNOWN_STATE',
    });
  });

  it('rejects unknown persisted states without coercing them', () => {
    expect(transitionUserState('enterWaiting', 'BROKEN_STATE')).toEqual({
      ok: false,
      action: 'enterWaiting',
      from: 'BROKEN_STATE',
      to: USER_STATUS.WAITING,
      reason: 'UNKNOWN_STATE',
    });
  });

  it('checks state capability by exact explicit membership', () => {
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
