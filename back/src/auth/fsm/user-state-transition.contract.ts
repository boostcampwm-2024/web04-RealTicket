import {
  getUserStateTransitionTarget,
  transitionUserState,
  type BookingUserState,
  type SessionUserStatus,
  type TransitionResult,
  type UserStateTransitionAction,
} from './user-state.fsm';

export type TargetEventPatch = { mode: 'set'; eventId: number } | { mode: 'preserve' } | { mode: 'clear' };

export type LuaUserStateTransitionBaseCode =
  | 'OK'
  | 'SESSION_MISSING'
  | 'STATE_MISMATCH'
  | 'TARGET_EVENT_MISMATCH'
  | 'SESSION_EXPIRED_DURING_WRITE';

export type LuaUserStateTransitionCode<TBusinessCode extends string = never> =
  | LuaUserStateTransitionBaseCode
  | TBusinessCode;

export type LuaUserStateTransitionInput = {
  sessionKey: string;
  action: UserStateTransitionAction;
  expectedFrom?: BookingUserState;
  nextTo: BookingUserState;
  targetEventPatch: TargetEventPatch;
  expectedTargetEvent?: number | null;
};

export type LuaUserStateTransitionResult<TBusinessCode extends string = never> =
  | {
      ok: true;
      code: 'OK';
      action: UserStateTransitionAction;
      from?: BookingUserState;
      to: BookingUserState;
    }
  | {
      ok: false;
      code: Exclude<LuaUserStateTransitionCode<TBusinessCode>, 'OK'>;
      action: UserStateTransitionAction;
      expectedFrom?: BookingUserState;
      nextTo: BookingUserState;
      details: readonly unknown[];
    };

export type LuaUserStateTransitionRawResult<TBusinessCode extends string = never> =
  | LuaUserStateTransitionCode<TBusinessCode>
  | readonly [LuaUserStateTransitionCode<TBusinessCode>, ...unknown[]]
  | {
      code: LuaUserStateTransitionCode<TBusinessCode>;
      details?: readonly unknown[] | Record<string, unknown>;
    };

export type BuildLuaUserStateTransitionInputParams = {
  sid: string;
  action: UserStateTransitionAction;
  expectedFrom?: SessionUserStatus | string;
  targetEventPatch: TargetEventPatch;
  expectedTargetEvent?: number | null;
};

export type MapLuaUserStateTransitionResultContext<TBusinessCode extends string = never> = {
  action: UserStateTransitionAction;
  expectedFrom?: BookingUserState;
  nextTo: BookingUserState;
  businessCodes?: readonly TBusinessCode[];
};

const BASE_CODES = [
  'OK',
  'SESSION_MISSING',
  'STATE_MISMATCH',
  'TARGET_EVENT_MISMATCH',
  'SESSION_EXPIRED_DURING_WRITE',
] as const satisfies readonly LuaUserStateTransitionBaseCode[];

const BASE_CODE_SET = new Set<string>(BASE_CODES);

function isKnownBaseCode(code: string): code is LuaUserStateTransitionBaseCode {
  return BASE_CODE_SET.has(code);
}

function isDeclaredBusinessCode<TBusinessCode extends string>(
  code: string,
  businessCodes: readonly TBusinessCode[] | undefined,
): code is TBusinessCode {
  return businessCodes?.includes(code as TBusinessCode) ?? false;
}

function normalizeDetails(details: unknown): readonly unknown[] {
  if (details === undefined) {
    return [];
  }

  return Array.isArray(details) ? details : [details];
}

function parseRawLuaResult<TBusinessCode extends string>(
  raw: LuaUserStateTransitionRawResult<TBusinessCode>,
): {
  code: LuaUserStateTransitionCode<TBusinessCode>;
  details: readonly unknown[];
} {
  if (typeof raw === 'string') {
    return { code: raw, details: [] };
  }

  if (Array.isArray(raw)) {
    const [code, ...details] = raw;
    if (typeof code !== 'string') {
      throw new TypeError('Lua user state transition result code must be a string');
    }

    return { code: code as LuaUserStateTransitionCode<TBusinessCode>, details };
  }

  if (raw && typeof raw === 'object' && 'code' in raw && typeof raw.code === 'string') {
    return {
      code: raw.code,
      details: normalizeDetails(raw.details),
    };
  }

  throw new TypeError('Lua user state transition result must include a string code');
}

export type ResolvedUserStateTransition = {
  action: UserStateTransitionAction;
  from: BookingUserState;
  to: BookingUserState;
};

export function resolveUserStateTransition(
  action: UserStateTransitionAction,
  expectedFrom: BookingUserState,
): ResolvedUserStateTransition {
  const result = transitionUserState(action, expectedFrom);

  // strictNullChecks가 꺼져 있어 ok 판별만으로는 좁혀지지 않으므로 reason 유무로 실패를 가른다.
  if ('reason' in result) {
    throw new TypeError(
      `상태 전이 테이블이 허용하지 않는 전이입니다: ${action} (from=${expectedFrom}, reason=${result.reason})`,
    );
  }

  return { action, from: result.from, to: result.to };
}

export function buildLuaUserStateTransitionInput(
  params: BuildLuaUserStateTransitionInputParams,
): TransitionResult | LuaUserStateTransitionInput {
  if (params.expectedFrom === undefined) {
    return {
      sessionKey: `user:${params.sid}`,
      action: params.action,
      nextTo: getUserStateTransitionTarget(params.action),
      targetEventPatch: params.targetEventPatch,
      expectedTargetEvent: params.expectedTargetEvent,
    };
  }

  const result = transitionUserState(params.action, params.expectedFrom);

  if (!result.ok) {
    return result;
  }

  return {
    sessionKey: `user:${params.sid}`,
    action: params.action,
    expectedFrom: result.from,
    nextTo: result.to,
    targetEventPatch: params.targetEventPatch,
    expectedTargetEvent: params.expectedTargetEvent,
  };
}

export function mapLuaUserStateTransitionResult<TBusinessCode extends string = never>(
  raw: LuaUserStateTransitionRawResult<TBusinessCode>,
  context: MapLuaUserStateTransitionResultContext<TBusinessCode>,
): LuaUserStateTransitionResult<TBusinessCode> {
  const { code, details } = parseRawLuaResult(raw);

  if (!isKnownBaseCode(code) && !isDeclaredBusinessCode(code, context.businessCodes)) {
    throw new TypeError(`Unknown Lua user state transition code: ${code}`);
  }

  if (code === 'OK') {
    return {
      ok: true,
      code: 'OK',
      action: context.action,
      to: context.nextTo,
      ...(context.expectedFrom === undefined ? {} : { from: context.expectedFrom }),
    };
  }

  return {
    ok: false,
    code: code as Exclude<LuaUserStateTransitionCode<TBusinessCode>, 'OK'>,
    action: context.action,
    nextTo: context.nextTo,
    details,
    ...(context.expectedFrom === undefined ? {} : { expectedFrom: context.expectedFrom }),
  };
}
