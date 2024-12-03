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

export function calculatePolygonCentroid(vertices: number[][]) {
  let area = 0; // 다각형 면적
  let Cx = 0; // 무게 중심 x 좌표
  let Cy = 0; // 무게 중심 y 좌표

  // 꼭지점 수
  const n = vertices.length;

  // 면적 및 무게 중심 계산
  for (let i = 0; i < n; i++) {
    // 현재 점과 다음 점
    const [x0, y0] = vertices[i];
    const [x1, y1] = vertices[(i + 1) % n]; // 마지막 점은 첫 점과 연결

    // 면적 기여도 계산
    const cross = x0 * y1 - x1 * y0;

    // 누적 계산
    area += cross;
    Cx += (x0 + x1) * cross;
    Cy += (y0 + y1) * cross;
  }

  // 면적 계산 완료
  area /= 2;

  // 무게 중심 좌표 계산
  Cx /= 6 * area;
  Cy /= 6 * area;

  return [Cx, Cy];
}
