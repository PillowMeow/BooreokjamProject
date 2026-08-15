// 색 유틸.
//
// 그라데이션은 OKLCH를 기본으로 삼는다. HSV는 익숙하지만 색상(h)을 돌릴 때 밝기가 들쭉날쭉해서
// (노랑은 튀고 파랑은 가라앉는다) 그라데이션이 고르지 않다. OKLab/OKLCH는 지각 밝기가 균일해서
// 같은 L 값이면 어느 색상이든 비슷한 밝기로 보인다. mix()도 OKLab에서 섞는다.
//
// 반환값은 항상 '#rrggbb' 문자열이라 어디서든 그대로 쓸 수 있다.

const probe = typeof document !== 'undefined'
  ? document.createElement('canvas').getContext('2d')
  : null;

const parseCache = new Map();

/** CSS 색 문자열 -> [r, g, b] (0~255) */
export function parseColor(css) {
  let rgb = parseCache.get(css);
  if (rgb) return rgb;

  if (typeof css === 'string' && css[0] === '#' && (css.length === 7 || css.length === 4)) {
    rgb = css.length === 7
      ? [parseInt(css.slice(1, 3), 16), parseInt(css.slice(3, 5), 16), parseInt(css.slice(5, 7), 16)]
      : [17 * parseInt(css[1], 16), 17 * parseInt(css[2], 16), 17 * parseInt(css[3], 16)];
  } else if (probe) {
    probe.fillStyle = '#000';
    probe.fillStyle = css;
    const norm = probe.fillStyle;
    if (norm[0] === '#') {
      const n = parseInt(norm.slice(1, 7), 16);
      rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    } else {
      const m = norm.match(/[\d.]+/g);
      rgb = m ? m.slice(0, 3).map(Number) : [255, 255, 255];
    }
  } else {
    rgb = [255, 255, 255];
  }

  parseCache.set(css, rgb);
  return rgb;
}

export function toHex(r, g, b) {
  const c = (v) => clamp255(Math.round(v)).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// ── HSV / HSL ───────────────────────────────────────────────────────

/**
 * h: 도(0~360, 넘어가면 알아서 감김), s·v: 0~1
 */
export function hsv(h, s = 1, v = 1) {
  const hh = (((h % 360) + 360) % 360) / 60;
  const c = v * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function hsl(h, s = 1, l = 0.5) {
  const v = l + s * Math.min(l, 1 - l);
  const sv = v === 0 ? 0 : 2 * (1 - l / v);
  return hsv(h, sv, v);
}

// ── OKLab / OKLCH ───────────────────────────────────────────────────

function srgbToLinear(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return v * 255;
}

/** [r,g,b] 0~255 -> [L, a, b] */
export function rgbToOklab([r, g, b]) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** [L, a, b] -> [r,g,b] 0~255 (가무트를 벗어나면 잘린다) */
export function oklabToRgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;

  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/**
 * 지각적으로 균일한 색 지정.
 * l: 밝기 0~1 (0.75쯤이 이 시뮬레이터의 탄에 적당하다)
 * c: 채도 0~0.37 (0.15~0.25가 선명한 편)
 * h: 색상 각도 0~360
 */
export function oklch(l, c, h) {
  const rad = (h * Math.PI) / 180;
  const [r, g, b] = oklabToRgb([l, c * Math.cos(rad), c * Math.sin(rad)]);
  return toHex(r, g, b);
}

/** 두 색을 OKLab에서 섞는다. t=0이면 a, t=1이면 b. */
export function mix(a, b, t) {
  const A = rgbToOklab(parseColor(a));
  const B = rgbToOklab(parseColor(b));
  const [r, g, bl] = oklabToRgb([
    A[0] + (B[0] - A[0]) * t,
    A[1] + (B[1] - A[1]) * t,
    A[2] + (B[2] - A[2]) * t,
  ]);
  return toHex(r, g, bl);
}

/**
 * 여러 색을 잇는 그라데이션. `t => '#rrggbb'` 를 돌려준다.
 * 같은 t는 캐시되므로 매 프레임 불러도 괜찮다.
 */
export function gradient(colors, { steps = 64 } = {}) {
  const list = colors.length ? colors : ['#ffffff'];
  const cache = new Array(steps + 1);
  return (t) => {
    const u = t < 0 ? 0 : t > 1 ? 1 : t;
    const idx = Math.round(u * steps);
    let hit = cache[idx];
    if (hit) return hit;

    const pos = (idx / steps) * (list.length - 1);
    const i = Math.min(list.length - 2, Math.floor(pos));
    hit = list.length === 1 ? list[0] : mix(list[i], list[i + 1], pos - i);
    cache[idx] = hit;
    return hit;
  };
}

/** 색상만 deg만큼 돌린다 (밝기·채도 유지) */
export function hueShift(color, deg) {
  const [L, A, B] = rgbToOklab(parseColor(color));
  const c = Math.hypot(A, B);
  const h = Math.atan2(B, A) + (deg * Math.PI) / 180;
  const [r, g, bl] = oklabToRgb([L, c * Math.cos(h), c * Math.sin(h)]);
  return toHex(r, g, bl);
}

/** 밝기만 올리거나(양수) 내린다(음수). amount는 -1~1. */
export function lighten(color, amount) {
  const [L, A, B] = rgbToOklab(parseColor(color));
  const [r, g, bl] = oklabToRgb([Math.max(0, Math.min(1, L + amount)), A, B]);
  return toHex(r, g, bl);
}

/** 무지개 한 바퀴. t: 0~1 */
export function rainbow(t, { l = 0.78, c = 0.19 } = {}) {
  return oklch(l, c, t * 360);
}
