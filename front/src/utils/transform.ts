type Transformer = (key: string) => string;

export const transformKey = (obj: unknown, transformer: Transformer): unknown => {
  // 배열 처리
  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (typeof item === 'object' && item !== null) {
        return transformKey(item, transformer); // 객체일 경우 재귀적으로 처리
      }
      return item; // 객체가 아니면 그대로 반환
    });
  }

  // 객체 처리
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce(
      (acc: Record<string, unknown>, key: string) => {
        const transformedKey = transformer(key); // 키 변환
        acc[transformedKey] = transformKey((obj as Record<string, unknown>)[key], transformer); // 재귀적으로 키 변환
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  // 객체나 배열이 아닌 경우 그대로 반환
  return obj;
};
