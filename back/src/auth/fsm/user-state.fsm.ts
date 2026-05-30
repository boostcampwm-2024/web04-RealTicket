export const USER_STATUS = {
  LOGIN: 'LOGIN',
  WAITING: 'WAITING',
  ENTERING: 'ENTERING',
  SELECTING_SEAT: 'SELECTING_SEAT',
  RECONNECTING_SELECTING: 'RECONNECTING_SELECTING',
} as const;

export const BOOKING_USER_STATES = [
  USER_STATUS.LOGIN,
  USER_STATUS.WAITING,
  USER_STATUS.ENTERING,
  USER_STATUS.SELECTING_SEAT,
  USER_STATUS.RECONNECTING_SELECTING,
] as const;

export type SessionUserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];
export type BookingUserState = (typeof BOOKING_USER_STATES)[number];

export type UserStateTransitionAction =
  | 'enterWaiting'
  | 'enterBookingGate'
  | 'startSeatSelection'
  | 'markReconnectingSelection'
  | 'restoreSeatSelection'
  | 'resetToLogin';

export type TransitionResult =
  | { ok: true; action: UserStateTransitionAction; from: BookingUserState; to: BookingUserState }
  | {
      ok: false;
      action: UserStateTransitionAction;
      from: SessionUserStatus | string;
      to: BookingUserState;
      reason: 'INVALID_TRANSITION' | 'UNKNOWN_STATE';
    };

type UserStateTransition = {
  action: UserStateTransitionAction;
  from: BookingUserState;
  to: BookingUserState;
};

export const USER_STATE_TRANSITIONS = [
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
] as const satisfies readonly UserStateTransition[];

const TRANSITION_DEFAULT_TARGETS: Record<UserStateTransitionAction, BookingUserState> = {
  enterWaiting: USER_STATUS.WAITING,
  enterBookingGate: USER_STATUS.ENTERING,
  startSeatSelection: USER_STATUS.SELECTING_SEAT,
  markReconnectingSelection: USER_STATUS.RECONNECTING_SELECTING,
  restoreSeatSelection: USER_STATUS.SELECTING_SEAT,
  resetToLogin: USER_STATUS.LOGIN,
};

const SESSION_USER_STATUS_SET = new Set<string>(Object.values(USER_STATUS));

function isSessionUserStatus(status: string): status is SessionUserStatus {
  return SESSION_USER_STATUS_SET.has(status);
}

export function getAllowedTransitions(): readonly UserStateTransition[] {
  return USER_STATE_TRANSITIONS;
}

export function transitionUserState(
  action: UserStateTransitionAction,
  current: SessionUserStatus | string,
): TransitionResult {
  const to = TRANSITION_DEFAULT_TARGETS[action];

  if (!isSessionUserStatus(current)) {
    return { ok: false, action, from: current, to, reason: 'UNKNOWN_STATE' };
  }

  const transition = USER_STATE_TRANSITIONS.find((row) => row.action === action && row.from === current);

  if (!transition) {
    return { ok: false, action, from: current, to, reason: 'INVALID_TRANSITION' };
  }

  return { ok: true, action, from: transition.from, to: transition.to };
}

export function enterWaiting(current: SessionUserStatus | string): TransitionResult {
  return transitionUserState('enterWaiting', current);
}

export function enterBookingGate(current: SessionUserStatus | string): TransitionResult {
  return transitionUserState('enterBookingGate', current);
}

export function startSeatSelection(current: SessionUserStatus | string): TransitionResult {
  return transitionUserState('startSeatSelection', current);
}

export function markReconnectingSelection(current: SessionUserStatus | string): TransitionResult {
  return transitionUserState('markReconnectingSelection', current);
}

export function restoreSeatSelection(current: SessionUserStatus | string): TransitionResult {
  return transitionUserState('restoreSeatSelection', current);
}

export function resetToLogin(current: SessionUserStatus | string): TransitionResult {
  return transitionUserState('resetToLogin', current);
}

export function canAccessState(
  currentState: BookingUserState,
  requiredStates: BookingUserState | readonly BookingUserState[],
): boolean {
  if (Array.isArray(requiredStates)) {
    return requiredStates.includes(currentState);
  }

  return currentState === requiredStates;
}
