import { USER_STATUS } from '../const/userStatus.const';
import { USER_ROLE } from '../../domains/user/const/userRole';

import {
  DEFAULT_SESSION_REQUIREMENT_EVALUATORS,
  canAccessSessionRequirements,
  type SessionRequirementEvaluator,
} from './session-auth-requirement.policy';

function createSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    loginId: 'user1',
    userStatus: USER_STATUS.LOGIN,
    roles: [USER_ROLE.USER],
    targetEvent: null,
    ...overrides,
  };
}

describe('session auth requirement router', () => {
  it('allows USER role requirements through explicit USER membership regardless of booking state', () => {
    expect(
      canAccessSessionRequirements(
        createSession({ userStatus: USER_STATUS.SELECTING_SEAT, roles: [USER_ROLE.USER] }),
        USER_ROLE.USER,
      ),
    ).toBe(true);
  });

  it('allows ADMIN role requirements only through explicit ADMIN membership', () => {
    expect(
      canAccessSessionRequirements(
        createSession({ roles: [USER_ROLE.USER, USER_ROLE.ADMIN] }),
        USER_ROLE.ADMIN,
      ),
    ).toBe(true);
    expect(canAccessSessionRequirements(createSession({ roles: [USER_ROLE.USER] }), USER_ROLE.ADMIN)).toBe(
      false,
    );
  });

  it('treats LOGIN as an exact state requirement', () => {
    expect(canAccessSessionRequirements(createSession({ userStatus: USER_STATUS.LOGIN }), USER_STATUS.LOGIN)).toBe(
      true,
    );
    expect(
      canAccessSessionRequirements(createSession({ userStatus: USER_STATUS.WAITING }), USER_STATUS.LOGIN),
    ).toBe(false);
  });

  it('treats SELECTING_SEAT as an exact state requirement only', () => {
    expect(
      canAccessSessionRequirements(
        createSession({ userStatus: USER_STATUS.SELECTING_SEAT }),
        USER_STATUS.SELECTING_SEAT,
      ),
    ).toBe(true);

    for (const userStatus of [USER_STATUS.ENTERING, USER_STATUS.LOGIN]) {
      expect(canAccessSessionRequirements(createSession({ userStatus }), USER_STATUS.SELECTING_SEAT)).toBe(
        false,
      );
    }
  });

  it('uses OR semantics for mixed exact state and explicit role requirements', () => {
    const requirements = [USER_STATUS.SELECTING_SEAT, USER_ROLE.ADMIN];

    expect(
      canAccessSessionRequirements(
        createSession({ userStatus: USER_STATUS.SELECTING_SEAT, roles: [USER_ROLE.USER] }),
        requirements,
      ),
    ).toBe(true);
    expect(
      canAccessSessionRequirements(
        createSession({ userStatus: USER_STATUS.LOGIN, roles: [USER_ROLE.USER, USER_ROLE.ADMIN] }),
        requirements,
      ),
    ).toBe(true);
    expect(
      canAccessSessionRequirements(
        createSession({ userStatus: USER_STATUS.WAITING, roles: [USER_ROLE.USER] }),
        requirements,
      ),
    ).toBe(false);
  });

  it('does not let ADMIN pass USER through hierarchy', () => {
    expect(canAccessSessionRequirements(createSession({ roles: [USER_ROLE.ADMIN] }), USER_ROLE.USER)).toBe(
      false,
    );
  });

  it('routes the ADMIN runtime token as role semantics, not state semantics', () => {
    const staleAdminState = USER_ROLE.ADMIN;

    expect(
      canAccessSessionRequirements(
        createSession({ userStatus: staleAdminState, roles: [USER_ROLE.USER] }),
        USER_ROLE.ADMIN,
      ),
    ).toBe(false);
    expect(
      canAccessSessionRequirements(
        createSession({ userStatus: USER_STATUS.LOGIN, roles: [USER_ROLE.USER, USER_ROLE.ADMIN] }),
        USER_ROLE.ADMIN,
      ),
    ).toBe(true);
  });

  it('normalizes legacy sessions without roles through narrow compatibility rules', () => {
    const { roles: _roles, ...legacyUserSession } = createSession({ userStatus: USER_STATUS.WAITING });

    expect(canAccessSessionRequirements(legacyUserSession, USER_ROLE.USER)).toBe(true);
    expect(canAccessSessionRequirements(legacyUserSession, USER_ROLE.ADMIN)).toBe(false);
  });

  it('fails closed for stale admin state sessions even when role data is present', () => {
    const staleAdminState = USER_ROLE.ADMIN;
    const { roles: _roles, ...staleSessionWithoutRoles } = createSession({
      userStatus: staleAdminState,
    });

    expect(canAccessSessionRequirements(staleSessionWithoutRoles, USER_ROLE.ADMIN)).toBe(false);
    expect(
      canAccessSessionRequirements(
        createSession({
          userStatus: staleAdminState,
          roles: [USER_ROLE.USER, USER_ROLE.ADMIN],
        }),
        USER_ROLE.ADMIN,
      ),
    ).toBe(false);
  });

  it.each([
    ['BROKEN_REQUIREMENT', createSession()],
    [[], createSession()],
    [[USER_ROLE.USER, 'BROKEN_REQUIREMENT'], createSession()],
    [[USER_ROLE.USER, 7], createSession()],
    [USER_ROLE.USER, null],
    [USER_ROLE.USER, createSession({ userStatus: undefined })],
    [USER_ROLE.USER, createSession({ roles: 'USER' })],
    [USER_ROLE.USER, createSession({ roles: [USER_ROLE.USER, 'ROOT'] })],
    [USER_ROLE.USER, createSession({ userStatus: 'BROKEN_STATE' })],
  ])('fails closed for requirement=%p session=%p', (requirements, session) => {
    expect(canAccessSessionRequirements(session, requirements as never)).toBe(false);
  });

  it('accepts a fake evaluator extension without changing guard call sites', () => {
    const fakeEvaluator: SessionRequirementEvaluator = {
      name: 'feature-flag',
      supports: jest.fn((requirement) => requirement.startsWith('feature:')),
      evaluate: jest.fn((session, requirement) =>
        Array.isArray(session.features) ? session.features.includes(requirement) : false,
      ),
    };

    expect(
      canAccessSessionRequirements(
        createSession({ features: ['feature:beta'], roles: [USER_ROLE.ADMIN] }),
        [USER_ROLE.USER, 'feature:beta'],
        [...DEFAULT_SESSION_REQUIREMENT_EVALUATORS, fakeEvaluator],
      ),
    ).toBe(true);

    expect(fakeEvaluator.supports).not.toHaveBeenCalledWith(USER_ROLE.USER);
    expect(fakeEvaluator.evaluate).toHaveBeenCalledTimes(1);
    expect(fakeEvaluator.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({ features: ['feature:beta'] }),
      'feature:beta',
    );
  });
});
