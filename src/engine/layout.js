import { TAU } from './config.js';
import { polar, lerp, pathTangent } from './mathx.js';

// 발사 "위치 배치"를 만드는 함수들.
// 전부 원점(0,0) 기준 지역 좌표 배열을 돌려준다. 실제 좌표 변환·회전·방향 결정은 Stage가 한다.
//
// 각 점: { x, y, angle(기본 진행 방향), tangent(배치 곡선의 접선) }

export function ringPoints({ count = 12, angle = 0, radius = 0 }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const dir = angle + (TAU * i) / count;
    const p = polar(dir, radius);
    out.push({ x: p.x, y: p.y, angle: dir, tangent: dir + Math.PI / 2 });
  }
  return out;
}

export function fanPoints({ count = 5, angle = 0, spread = Math.PI / 6, radius = 0 }) {
  const out = [];
  if (count === 1) {
    const p = polar(angle, radius);
    return [{ x: p.x, y: p.y, angle, tangent: angle + Math.PI / 2 }];
  }
  const step = spread / (count - 1);
  const start = angle - spread / 2;
  for (let i = 0; i < count; i++) {
    const dir = start + step * i;
    const p = polar(dir, radius);
    out.push({ x: p.x, y: p.y, angle: dir, tangent: dir + Math.PI / 2 });
  }
  return out;
}

export function linePoints({ from, to, count = 5, angle = Math.PI / 2 }) {
  const out = [];
  const tangent = Math.atan2(to.y - from.y, to.x - from.x);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    out.push({
      x: lerp(from.x, to.x, t),
      y: lerp(from.y, to.y, t),
      angle,
      tangent,
    });
  }
  return out;
}

export function arcPoints({ radius = 60, from = 0, to = Math.PI, count = 8 }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const a = lerp(from, to, t);
    const p = polar(a, radius);
    out.push({ x: p.x, y: p.y, angle: a, tangent: a + Math.PI / 2 });
  }
  return out;
}

/**
 * 정다각형.
 *   mode 'vertex'  : 꼭짓점에만
 *   mode 'outline' : 각 변을 perSide등분해서 채운다 (기본)
 */
// rotation은 Stage._emit이 배치 전체에 한 번만 적용한다. 레이아웃 쪽에서는 건드리지 않는다.
export function polygonPoints({ sides = 5, radius = 60, perSide = 3, mode = 'outline' }) {
  const n = Math.max(3, Math.round(sides));
  const out = [];

  for (let i = 0; i < n; i++) {
    const a0 = (TAU * i) / n;
    const a1 = (TAU * (i + 1)) / n;
    const p0 = polar(a0, radius);
    const p1 = polar(a1, radius);
    const edge = Math.atan2(p1.y - p0.y, p1.x - p0.x);

    if (mode === 'vertex') {
      out.push({ x: p0.x, y: p0.y, angle: a0, tangent: edge });
      continue;
    }
    const per = Math.max(1, Math.round(perSide));
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const x = lerp(p0.x, p1.x, t);
      const y = lerp(p0.y, p1.y, t);
      out.push({ x, y, angle: Math.atan2(y, x), tangent: edge });
    }
  }
  return out;
}

export function starPoints({ points = 5, inner = 30, outer = 60, perEdge = 3 }) {
  const n = Math.max(2, Math.round(points)) * 2;
  const out = [];
  for (let i = 0; i < n; i++) {
    const r0 = i % 2 === 0 ? outer : inner;
    const r1 = i % 2 === 0 ? inner : outer;
    const p0 = polar((TAU * i) / n, r0);
    const p1 = polar((TAU * (i + 1)) / n, r1);
    const edge = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const per = Math.max(1, Math.round(perEdge));
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const x = lerp(p0.x, p1.x, t);
      const y = lerp(p0.y, p1.y, t);
      out.push({ x, y, angle: Math.atan2(y, x), tangent: edge });
    }
  }
  return out;
}

export function gridPoints({ cols = 5, rows = 3, gapX = 24, gapY = 24, angle = Math.PI / 2 }) {
  const out = [];
  const w = (cols - 1) * gapX;
  const h = (rows - 1) * gapY;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({ x: c * gapX - w / 2, y: r * gapY - h / 2, angle, tangent: angle });
    }
  }
  return out;
}

/**
 * 임의 파라메트릭 경로 위에 배치.
 * closed면 t를 0..1-1/count로 (한 바퀴 도는 곡선), 아니면 0..1로 나눈다.
 */
export function pathPoints(path, { count = 24, closed = true }) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = closed ? i / count : count === 1 ? 0 : i / (count - 1);
    const p = path(t);
    out.push({ x: p.x, y: p.y, angle: Math.atan2(p.y, p.x), tangent: pathTangent(path, t) });
  }
  return out;
}
