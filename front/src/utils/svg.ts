type coordinate = number[];

export const getCenterCoordinate = (...points: coordinate[]) => {
  const sum = points.reduce(
    (acc, coordinate) => {
      const [tx, ty] = acc;
      const [x, y] = coordinate;
      const [nx, ny] = [tx + x, ty + y];
      return [nx, ny];
    },
    [0, 0],
  );
  const [tx, ty] = sum;
  return [tx / points.length, ty / points.length];
};

export const getPathD = (...points: number[][]) => {
  const lastIndex = points.length - 1;
  return points.reduce((acc, point, index) => {
    const [x, y] = point;
    if (index === lastIndex) return acc + `L ${x},${y} z`;
    if (index === 0) return acc + `M ${x},${y}`;
    return acc + `L ${x},${y},`;
  }, '');
};
