import { USER_ROLE } from '../../domains/user/const/userRole';
import { USER_STATUS, type SessionUserStatus } from '../fsm/user-state.fsm';

export type SessionAuthRequirement = string | readonly string[];

export type SessionRequirementSession = Record<string, unknown> & {
  userStatus?: unknown;
  roles?: unknown;
};

export type NormalizedSessionRequirementSession = Record<string, unknown> & {
  userStatus: SessionUserStatus;
  roles: readonly string[];
};

export type SessionRequirementEvaluator = {
  name: string;
  supports: (requirement: string) => boolean;
  evaluate: (session: NormalizedSessionRequirementSession, requirement: string) => boolean;
};

const KNOWN_SESSION_STATUSES = new Set<string>(Object.values(USER_STATUS));
const EXACT_STATE_REQUIREMENTS = new Set<string>([
  USER_STATUS.LOGIN,
  USER_STATUS.WAITING,
  USER_STATUS.ENTERING,
  USER_STATUS.SELECTING_SEAT,
  USER_STATUS.RECONNECTING_SELECTING,
]);
const KNOWN_ROLE_REQUIREMENTS = new Set<string>(Object.values(USER_ROLE));

function hasOwnRoles(session: SessionRequirementSession): boolean {
  return Object.prototype.hasOwnProperty.call(session, 'roles');
}

function isKnownSessionStatus(value: unknown): value is SessionUserStatus {
  return typeof value === 'string' && KNOWN_SESSION_STATUSES.has(value);
}

function normalizeExplicitRoles(roles: unknown): readonly string[] | null {
  if (!Array.isArray(roles)) {
    return null;
  }

  const uniqueRoles = new Set<string>();
  for (const role of roles) {
    if (typeof role !== 'string' || !KNOWN_ROLE_REQUIREMENTS.has(role)) {
      return null;
    }
    uniqueRoles.add(role);
  }

  return [...uniqueRoles];
}

function normalizeLegacyRoles(): readonly string[] {
  return [USER_ROLE.USER];
}

function normalizeSession(
  session: unknown,
): NormalizedSessionRequirementSession | null {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const sessionRecord = session as SessionRequirementSession;
  if (!isKnownSessionStatus(sessionRecord.userStatus)) {
    return null;
  }

  const roles = hasOwnRoles(sessionRecord)
    ? normalizeExplicitRoles(sessionRecord.roles)
    : normalizeLegacyRoles();

  if (!roles) {
    return null;
  }

  return {
    ...sessionRecord,
    userStatus: sessionRecord.userStatus,
    roles,
  };
}

function normalizeRequirements(requirements: unknown): readonly string[] | null {
  if (typeof requirements === 'string') {
    return [requirements];
  }

  if (!Array.isArray(requirements) || requirements.length === 0) {
    return null;
  }

  return requirements.every((requirement) => typeof requirement === 'string') ? requirements : null;
}

export const ROLE_REQUIREMENT_EVALUATOR: SessionRequirementEvaluator = {
  name: 'role',
  supports: (requirement) => KNOWN_ROLE_REQUIREMENTS.has(requirement),
  evaluate: (session, requirement) => session.roles.includes(requirement),
};

export const EXACT_STATE_REQUIREMENT_EVALUATOR: SessionRequirementEvaluator = {
  name: 'exact-state',
  supports: (requirement) => EXACT_STATE_REQUIREMENTS.has(requirement),
  evaluate: (session, requirement) => session.userStatus === requirement,
};

export const DEFAULT_SESSION_REQUIREMENT_EVALUATORS = [
  ROLE_REQUIREMENT_EVALUATOR,
  EXACT_STATE_REQUIREMENT_EVALUATOR,
] as const satisfies readonly SessionRequirementEvaluator[];

export function canAccessSessionRequirements(
  session: unknown,
  requirements: SessionAuthRequirement,
  evaluators: readonly SessionRequirementEvaluator[] = DEFAULT_SESSION_REQUIREMENT_EVALUATORS,
): boolean {
  const normalizedRequirements = normalizeRequirements(requirements);
  if (!normalizedRequirements || evaluators.length === 0) {
    return false;
  }

  const requirementEvaluators: Array<{
    requirement: string;
    evaluator: SessionRequirementEvaluator;
  }> = [];

  for (const requirement of normalizedRequirements) {
    const evaluator = evaluators.find((candidate) => candidate.supports(requirement));
    if (!evaluator) {
      return false;
    }
    requirementEvaluators.push({ requirement, evaluator });
  }

  const normalizedSession = normalizeSession(session);
  if (!normalizedSession) {
    return false;
  }

  return requirementEvaluators.some(({ evaluator, requirement }) =>
    evaluator.evaluate(normalizedSession, requirement),
  );
}
