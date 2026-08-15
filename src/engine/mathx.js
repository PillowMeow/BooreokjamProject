import { TAU } from './config.js';

// 좌표·각도 유틸과 경로(path) 생성기.
// 경로는 전부 `t => ({ x, y })` 꼴이고 t는 0~1이다. 배치(firePath)와 이동(motion: 'path') 양쪽에서 쓴다.

export function polar(angle, dist, origin) {
  const x = Math.cos(angle) * dist;
  const y = Math.sin(angle) * dist;
  return origin ? { x: origin.x + x, y: origin.y + y } : { x, y };
}

export function dist(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** -PI ~ PI 로 정규화 */
export function wrapAngle(a) {
  let v = (a + Math.PI) % TAU;
  if (v < 0) v += TAU;
  return v - Math.PI;
}

/** from에서 to로 가는 최단 회전량 */
export function angleDiff(from, to) {
  return wrapAngle(to - from);
}

/** cur에서 target으로 최대 maxStep만큼 다가간 값 (각도면 wrap을 쓴다) */
export function approach(cur, target, maxStep) {
  const d = target - cur;
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

export function approachAngle(cur, target, maxStep) {
  const d = angleDiff(cur, target);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

export function rotateAround(point, center, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// 0~1 -> 0~1
export const ease = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  sine: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
  back: (t) => t * t * (2.7 * t - 1.7),
};

// ── 경로 ────────────────────────────────────────────────────────────

const ORIGIN = { x: 0, y: 0 };

export function pathCircle(radius, { center = ORIGIN, from = 0, to = TAU } = {}) {
  return (t) => polar(from + (to - from) * t, radius, center);
}

/**
 * 정다각형 둘레. t=0이 첫 꼭짓점이고 시계 방향으로 한 바퀴.
 */
export function pathPolygon(sides, radius, { center = ORIGIN, rotation = 0 } = {}) {
  const n = Math.max(3, Math.round(sides));
  return (t) => {
    const u = ((t % 1) + 1) % 1;
    const edge = u * n;
    const i = Math.floor(edge);
    const f = edge - i;
    const a0 = rotation + (TAU * i) / n;
    const a1 = rotation + (TAU * (i + 1)) / n;
    const p0 = polar(a0, radius, center);
    const p1 = polar(a1, radius, center);
    return { x: lerp(p0.x, p1.x, f), y: lerp(p0.y, p1.y, f) };
  };
}

/** 별 모양 둘레. points개의 뿔, 안쪽 반지름 inner / 바깥 outer. */
export function pathStar(points, inner, outer, { center = ORIGIN, rotation = 0 } = {}) {
  const n = Math.max(2, Math.round(points)) * 2;
  return (t) => {
    const u = ((t % 1) + 1) % 1;
    const edge = u * n;
    const i = Math.floor(edge);
    const f = edge - i;
    const r0 = i % 2 === 0 ? outer : inner;
    const r1 = i % 2 === 0 ? inner : outer;
    const a0 = rotation + (TAU * i) / n;
    const a1 = rotation + (TAU * (i + 1)) / n;
    const p0 = polar(a0, r0, center);
    const p1 = polar(a1, r1, center);
    return { x: lerp(p0.x, p1.x, f), y: lerp(p0.y, p1.y, f) };
  };
}

export function pathLine(from, to) {
  return (t) => ({ x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) });
}

/** 리사주 곡선. a:b 비율이 무늬를 정한다 (3:2, 5:4 …) */
export function pathLissajous(a, b, { center = ORIGIN, width = 100, height = 100, delta = Math.PI / 2 } = {}) {
  return (t) => ({
    x: center.x + width * Math.sin(a * TAU * t + delta),
    y: center.y + height * Math.sin(b * TAU * t),
  });
}

/** 장미 곡선. k가 정수면 홀수는 k장, 짝수는 2k장의 꽃잎이 된다. */
export function pathRose(k, radius, { center = ORIGIN, rotation = 0 } = {}) {
  return (t) => {
    const a = rotation + TAU * t;
    return polar(a, radius * Math.cos(k * a), center);
  };
}

/** 3차 베지에 */
export function pathBezier(p0, p1, p2, p3) {
  return (t) => {
    const u = 1 - t;
    const w0 = u * u * u;
    const w1 = 3 * u * u * t;
    const w2 = 3 * u * t * t;
    const w3 = t * t * t;
    return {
      x: p0.x * w0 + p1.x * w1 + p2.x * w2 + p3.x * w3,
      y: p0.y * w0 + p1.y * w1 + p2.y * w2 + p3.y * w3,
    };
  };
}

/** 경로의 t 지점 접선 방향 */
export function pathTangent(path, t, step = 0.002) {
  const a = path(Math.max(0, t - step));
  const b = path(Math.min(1, t + step));
  return Math.atan2(b.y - a.y, b.x - a.x);
}
