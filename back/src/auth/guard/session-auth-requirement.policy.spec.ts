import { USER_ROLE } from '../../domains/user/const/userRole';
import { USER_STATUS } from '../const/userStatus.const';

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

describe('세션 인증 요구사항 판정', () => {
  it('예매 상태와 관계없이 명시적인 USER 역할로 접근을 허용함', () => {
    expect(
      canAccessSessionRequirements(
        createSession({ userStatus: USER_STATUS.SELECTING_SEAT, roles: [USER_ROLE.USER] }),
        USER_ROLE.USER,
      ),
    ).toBe(true);
  });

  it('명시적인 ADMIN 역할이 있을 때만 관리자 접근을 허용함', () => {
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

  it('LOGIN 요구사항은 현재 상태가 정확히 일치해야 허용함', () => {
    expect(
      canAccessSessionRequirements(createSession({ userStatus: USER_STATUS.LOGIN }), USER_STATUS.LOGIN),
    ).toBe(true);
    expect(
      canAccessSessionRequirements(createSession({ userStatus: USER_STATUS.WAITING }), USER_STATUS.LOGIN),
    ).toBe(false);
  });

  it('SELECTING_SEAT 요구사항은 좌석 선택 상태만 허용함', () => {
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

  it('상태와 역할 요구사항 중 하나를 만족하면 접근을 허용함', () => {
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

  it('ADMIN 역할만으로 USER 역할 요구사항을 통과하지 못함', () => {
    expect(canAccessSessionRequirements(createSession({ roles: [USER_ROLE.ADMIN] }), USER_ROLE.USER)).toBe(
      false,
    );
  });

  it('ADMIN 요구사항은 상태가 아닌 역할로 판정함', () => {
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

  it('역할이 없는 기존 세션에는 제한된 호환 규칙을 적용함', () => {
    const legacyUserSession = createSession({ userStatus: USER_STATUS.WAITING });
    delete legacyUserSession.roles;

    expect(canAccessSessionRequirements(legacyUserSession, USER_ROLE.USER)).toBe(true);
    expect(canAccessSessionRequirements(legacyUserSession, USER_ROLE.ADMIN)).toBe(false);
  });

  it('역할이 있어도 폐기된 ADMIN 상태의 세션은 거부함', () => {
    const staleAdminState = USER_ROLE.ADMIN;
    const staleSessionWithoutRoles = createSession({
      userStatus: staleAdminState,
    });
    delete staleSessionWithoutRoles.roles;

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
  ])('잘못된 요구사항 %p 또는 세션 %p의 접근을 거부함', (requirements, session) => {
    expect(canAccessSessionRequirements(session, requirements as never)).toBe(false);
  });

  it('가드 호출부를 바꾸지 않고 테스트용 판정기를 확장함', () => {
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
