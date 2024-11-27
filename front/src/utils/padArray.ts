export const padEndArray = <T, P>(array: T[], targetLength: number, padData: P) => {
  const padArray = Array(targetLength).fill(padData);

  return array.concat(padArray).slice(0, targetLength) as (T | P)[];
};
