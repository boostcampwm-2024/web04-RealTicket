import { camelCase, kebabCase } from 'es-toolkit/compat';
import { expect, test } from 'vitest';

import { transformKey } from './../src/utils/transform';

// 테스트용 데이터
const kebabTestData = {
  'user-name': 'JohnDoe',
  'user-profile': {
    'last-login-date': '2024-11-21',
    'favorite-categories': ['sports', 'music'],
  },
};

// 카멜 케이스 변환 함수

// 스네이크 케이스로 변환하는 함수

test('케밥 케이스에서 카멜 케이스로 변환', () => {
  const result = transformKey(kebabTestData, camelCase);

  expect(result).toEqual({
    userName: 'JohnDoe',
    userProfile: {
      lastLoginDate: '2024-11-21',
      favoriteCategories: ['sports', 'music'],
    },
  });
});
const camelTestData = {
  userName: 'JohnDoe',
  userProfile: {
    lastLoginDate: '2024-11-21',
    favoriteCategories: ['sports', 'music'],
  },
};
test('카멜 케이스에서 케밥 케이스로 변환', () => {
  const result = transformKey(camelTestData, kebabCase);

  expect(result).toEqual({
    'user-name': 'JohnDoe',
    'user-profile': {
      'last-login-date': '2024-11-21',
      'favorite-categories': ['sports', 'music'],
    },
  });
});
