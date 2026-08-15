import { TAU, LEFT, RIGHT, TOP, BOTTOM, FPS } from './config.js';
import { BulletPool } from './bullets.js';
import { Scheduler } from './scheduler.js';
import { Enemy } from './enemy.js';
import { Player, GRAZE_RADIUS, BOMB_INVULN } from './player.js';
import { Rng } from './rng.js';
import { BulletGroup } from './group.js';
import * as M from './mathx.js';
import * as COLOR from './color.js';
import * as L from './layout.js';
import { C } from '../palette.js';
import { audio } from './audio.js';
import { guardStage } from './guard.js';

// 탄에 그대로 넘길 수 있는 필드. 배치용 옵션(origin, facing 등)이 탄에 섞이지 않게 화이트리스트로 거른다.
const BULLET_KEYS = [
  'speed', 'accel', 'omega', 'minSpeed', 'maxSpeed',
  'r', 'size', 'shape', 'color', 'life', 'bombProof',
  'onUpdate', 'data', 'delay', 'motion', 'plan',
];

/**
 * 패턴 파일이 export default 로 내보내는 객체.
 * export default 앞에 @type {Pattern} 주석을 붙이면 main(s) 의 s 가 자동으로 Stage 로 잡힌다.
 * @typedef {Object} Pattern
 * @property {string} name UI·콘솔에 뜨는 이름
 * @property {'boss'|'survival'} [clear] 보스를 잡아서 클리어 / 시간을 버텨서 클리어
 * @property {number} [hp] clear: 'boss' 일 때 보스 체력 (초당 60씩 깎인다)
 * @property {number} [seconds] clear: 'survival' 일 때 버틸 시간(초)
 * @property {number[]} [thresholds] 임계점. 게이지가 지날 때마다 s.phase 가 오른다
 * @property {{density: number, speed: number, special: number}|[number, number, number]} [difficulty] 0~10 정수 3개
 * @property {string} [sprite] 보스 스프라이트 경로
 * @property {number} [spriteScale]
 * @property {(s: Stage) => void} [init] 시작 전 1회
 * @property {(s: Stage) => Generator} main 필수. 반드시 제너레이터
 */

/**
 * 탄 거동 모듈. type에 따라 쓰는 값이 다르다.
 * @typedef {{type: 'wave', amp?: number, period?: number, phase?: number}
 *   | {type: 'orbit', center: {x: number, y: number}|'player'|'boss', radius?: number, omega?: number, radiusSpeed?: number}
 *   | {type: 'homing', turn?: number, frames?: number, target?: {x: number, y: number}|'player'|'boss'}
 *   | {type: 'path', path: (t: number) => {x: number, y: number}, frames?: number, loop?: boolean,
 *      origin?: {x: number, y: number}, relative?: boolean, ease?: string, after?: 'vanish'}
 *   | {type: 'bounce', times?: number, padding?: number, floor?: boolean}} MotionOptions
 */

/**
 * 예약 변경 한 단계. at은 탄의 나이(프레임).
 * @typedef {Object} PlanStep
 * @property {number} at 탄의 나이(프레임)
 * @property {number} [over] 이 프레임 수 동안 보간 (없으면 즉시)
 * @property {'linear'|'in'|'out'|'inOut'|'inCubic'|'outCubic'|'sine'|'back'} [ease] over와 함께 쓴다
 * @property {number|'aim'|((b: import('./bullets.js').Bullet, s: Stage) => number)} [angle]
 * @property {number|((b: import('./bullets.js').Bullet, s: Stage) => number)} [speed]
 * @property {number} [omega]
 * @property {number} [accel]
 * @property {number} [size]
 * @property {number} [r]
 * @property {string} [color]
 * @property {boolean} [vanish] true면 그 시점에 사라진다
 * @property {MotionOptions} [motion]
 */

/**
 * i번째 탄에 값을 배분한다. 숫자는 [처음, 마지막], 색은 [처음색, 마지막색] 또는 함수.
 * @typedef {Object} RampOptions
 * @property {[number, number]|((t: number) => number)} [speed]
 * @property {[number, number]|((t: number) => number)} [size]
 * @property {[number, number]|((t: number) => number)} [r]
 * @property {[string, string]|((t: number) => string)} [color]
 */

/**
 * 발사 옵션. 탄 속성 + 배치 옵션을 한꺼번에 받는다.
 * (편집기에서 이 목록이 자동완성으로 뜬다)
 *
 * @typedef {Object} FireOptions
 * -- 위치·방향 --
 * @property {number} [x] 발사 위치 x (기본 0)
 * @property {number} [y] 발사 위치 y (아래쪽이 +)
 * @property {number} [angle] 진행 방향(라디안). s.deg(90)=아래, s.deg(-90)=위
 * @property {number} [speed] 프레임당 픽셀. 2면 초당 120px
 * -- 탄 모양 --
 * @property {'circle'|'orb'|'wedge'|'rod'} [shape] 모양 (기본 circle)
 * @property {number} [size] 그리기 크기 (기본 3). orb를 크게 하려면 10 이상
 * @property {number} [r] 판정 반지름 (기본 2.5). 보통 size보다 1~2 작게
 * @property {string} [color] 색. s.C.magenta 같은 팔레트나 '#rrggbb'
 * -- 움직임 --
 * @property {number} [accel] 프레임당 속도 증감
 * @property {number} [omega] 프레임당 각도 증감(라디안). 휘는 탄
 * @property {number} [minSpeed] accel 적용 시 하한
 * @property {number} [maxSpeed] accel 적용 시 상한
 * @property {MotionOptions} [motion] 거동 모듈
 * @property {PlanStep[]} [plan] 예약 변경 [{ at: 60, speed: 0 }]
 * @property {(b: import('./bullets.js').Bullet, s: Stage) => void} [onUpdate] 매 프레임 호출
 * -- 기타 --
 * @property {number} [life] 수명 프레임 (0=무제한)
 * @property {number} [delay] 등장 지연. 그동안 판정 없이 예고 표시
 * @property {boolean} [bombProof] 폭탄으로 안 지워짐
 * @property {any} [data] 자유롭게 쓰는 칸 (이름표 등)
 * @property {false|'circle'|'orb'|'wedge'|'rod'} [sound] false면 무음
 * -- 배치 (fireRing/fireFan/firePolygon 등) --
 * @property {number} [count] 발 수
 * @property {number} [spread] fireFan 전체 벌어짐 각(라디안)
 * @property {number} [radius] 중심에서 띄울 거리 / 도형 크기
 * @property {{x: number, y: number}} [origin] 배치 기준점
 * @property {{x: number, y: number}} [center] origin과 같음 (도형에서 쓰는 이름)
 * @property {number} [rotation] 배치 전체 회전
 * @property {'out'|'in'|'aim'|'along'|'normal'|number} [facing] 각 탄이 향할 방향
 * @property {'absolute'|'aim'|'sequence'} [aimType] angle 해석 방식
 * @property {boolean} [keepShape] 도형이 모양 그대로 확대되게
 * @property {number} [jitter] 위치를 이만큼 흩뿌림
 * @property {RampOptions} [ramp] i에 따라 값 배분 { speed:[1,3], color:[c1,c2] }
 * @property {(b: import('./bullets.js').Bullet, i: number, count: number) => void} [each] 생성 직후 콜백
 * -- 도형별 --
 * @property {{x: number, y: number}} [from] fireLine 시작점
 * @property {{x: number, y: number}} [to] fireLine 끝점
 * @property {number} [sides] firePolygon 변의 수
 * @property {number} [perSide] firePolygon 변마다 발 수
 * @property {'outline'|'vertex'} [mode] firePolygon 배치 방식
 * @property {number} [points] fireStar 뿔 수
 * @property {number} [inner] fireStar 안쪽 반지름
 * @property {number} [outer] fireStar 바깥 반지름
 * @property {number} [perEdge] fireStar 변마다 발 수
 * @property {number} [cols] fireGrid 열
 * @property {number} [rows] fireGrid 행
 * @property {number} [gapX] fireGrid 가로 간격
 * @property {number} [gapY] fireGrid 세로 간격
 * @property {boolean} [closed] firePath 닫힌 곡선인지
 */

/**
 * @typedef {Object} EnemyOptions
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [hp] 체력 (기본 100)
 * @property {number} [r] 판정 반지름 (기본 16)
 * @property {string} [color]
 * @property {boolean} [invuln] true면 플레이어 탄에 안 맞음
 * @property {boolean} [boss] true면 화면 위 게이지의 주인이 된다
 * @property {(e: import('./enemy.js').Enemy, s: Stage) => void} [onDeath] 죽을 때 호출
 * @property {any} [data]
 * @property {HTMLImageElement|null} [sprite] 스프라이트 (보스는 엔진이 넣는다)
 * @property {number} [spriteScale]
 * @property {number} [w]
 * @property {number} [h]
 */

// 화면 흔들림: [진폭(px), 지속 프레임]
/** @type {[number, number]} */
const DEATH_SHAKE = [7, 20];
/** @type {[number, number]} */
const BOMB_SHAKE = [10, 24];   // 폭탄은 크게, 0.4초

// 스프라이트를 쓰기 전 원형 보스는 반지름 18(지름 36)이었다. 그 1.5배인 세로 54px에
// 맞춰 스프라이트를 줄인다. 히트박스도 같이 줄어든다 (= 그려지는 사각형 그대로).
const BOSS_HEIGHT = 54;

/**
 * 한 판의 상태 전부이자, 탄막 패턴 파일이 받는 API 객체.
 * 패턴은 이 객체(관례상 이름 s)를 통해서만 세계에 손을 댄다.
 *
 * 패턴 파일이 선언하는 메타 정보:
 *   clear: 'boss' | 'survival'   보스를 잡아서 클리어인지, 시간을 버텨서 클리어인지
 *   hp: 1800                     clear: 'boss' 일 때 보스 체력
 *   seconds: 45                  clear: 'survival' 일 때 버틸 시간(초)
 *   thresholds: [0.66, 0.33]     임계점. 게이지가 이 아래로 내려갈 때마다 s.phase가 1 오른다.
 *                                (1보다 큰 값을 주면 절대 체력/초로 보고 알아서 비율로 바꾼다)
 */
export class Stage {
  constructor(pattern, seed = 12345) {
    this.pattern = pattern;
    this.rng = new Rng(seed);
    this.bullets = new BulletPool();
    this.scheduler = new Scheduler();
    this.enemies = [];
    this.player = new Player();

    this.frame = 0;
    this.finished = false;
    this.result = null;
    this.mainTask = null;
    this.boss = null;

    this.mode = pattern.clear === 'survival' ? 'survival' : 'boss';
    this.duration = Math.round((pattern.seconds ?? 60) * FPS);
    this.bossHp = pattern.hp ?? 1000;
    this.thresholds = normalizeThresholds(
      pattern.thresholds,
      this.mode === 'survival' ? pattern.seconds ?? 60 : this.bossHp,
    );

    this.stats = { bombs: 0, fired: 0 };
    this.lastAngle = 0;   // aimType: 'sequence' 가 기준으로 삼는 직전 발사각
    this.angleWarned = false;
    // 패턴에는 이걸 넘긴다. 없는 함수를 부르면 이름을 알려주며 오류를 낸다.
    this.api = guardStage(this);
    this.shakeAmp = 0;
    this.shakeLeft = 0;
    this.shakeTotal = 1;

    // 패턴이 읽기 좋으라고 노출하는 상수들
    this.TAU = TAU;
    this.PI = Math.PI;
    // 팔레트. 로컬 파일로 불러온 패턴은 import를 못 하므로 s.C로도 쓸 수 있게 둔다.
    this.C = C;
    this.bounds = { left: LEFT, right: RIGHT, top: TOP, bottom: BOTTOM };
  }

  start() {
    const img = this.pattern.spriteImage ?? null;
    const scale = this.pattern.spriteScale
      ?? (img ? BOSS_HEIGHT / img.naturalHeight : 1);
    const h = img ? img.naturalHeight * scale : 32;

    // 보스는 엔진이 만든다. 패턴은 s.boss로 받아서 움직이고 쏘기만 하면 된다.
    this.boss = this.spawn({
      x: 0,
      y: TOP + h / 2,
      sprite: img,
      spriteScale: scale,
      hp: this.mode === 'boss' ? this.bossHp : 1,
      invuln: this.mode !== 'boss',
      boss: true,
      color: '#7ffcd8',
    });

    if (typeof this.pattern.init === 'function') this.pattern.init(this.api);
    this.mainTask = this.scheduler.add(this.pattern.main(this.api));
  }

  // ── 조회 ──────────────────────────────────────────────────────────

  get px() { return this.player.x; }
  get py() { return this.player.y; }
  get bulletCount() { return this.bullets.count; }

  /** 보스바 게이지. 1에서 시작해 0으로 간다. */
  get gauge() {
    if (this.mode === 'survival') {
      return clamp01(1 - this.frame / this.duration);
    }
    const boss = this.boss;
    if (!boss || !boss.alive || boss.maxHp <= 0) return 0;
    return clamp01(boss.hp / boss.maxHp);
  }

  /** 지금까지 통과한 임계점 개수. 0 = 첫 구간. */
  get phase() {
    const g = this.gauge;
    let n = 0;
    for (const t of this.thresholds) if (g <= t) n++;
    return n;
  }

  /** 남은 시간(초). survival 모드에서 쓴다. */
  get remaining() {
    return Math.max(0, (this.duration - this.frame) / FPS);
  }

  /**
   * from에서 플레이어를 향하는 각도(라디안). 조준탄에 쓴다.
   * @param {{x: number, y: number}} from 보통 s.boss 또는 탄
   * @returns {number} 라디안
   */
  aim(from) {
    return Math.atan2(this.player.y - from.y, this.player.x - from.x);
  }

  /**
   * 두 점 사이 각도(라디안).
   * @param {{x: number, y: number}} from
   * @param {{x: number, y: number}} to
   * @returns {number} 라디안
   */
  angleTo(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  /**
   * 도 -> 라디안. 각도 자리에는 반드시 이걸 거쳐서 넣는다.
   * @param {number} d 도(0~360)
   * @returns {number} 라디안
   */
  deg(d) { return (d * Math.PI) / 180; }

  /**
   * min 이상 max 미만 실수. 시드 고정이라 재생할 때마다 같다.
   * @param {number} [min]
   * @param {number} [max]
   * @returns {number}
   */
  rand(min = 0, max = 1) { return this.rng.range(min, max); }
  /**
   * min 이상 max 이하 정수.
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  randInt(min, max) { return this.rng.int(min, max); }
  /**
   * 배열에서 하나 고른다.
   * @template T
   * @param {T[]} arr
   * @returns {T}
   */
  pick(arr) { return this.rng.pick(arr); }

  // ── 좌표·각도 ─────────────────────────────────────────────────────

  /**
   * 각도·거리로 좌표를 만든다.
   * @param {number} angle 라디안
   * @param {number} dist 거리
   * @param {{x: number, y: number}} [origin] 기준점 (없으면 원점)
   * @returns {{x: number, y: number}}
   */
  polar(angle, dist, origin) { return M.polar(angle, dist, origin); }
  dist(a, b) { return M.dist(a, b); }
  wrapAngle(a) { return M.wrapAngle(a); }
  angleDiff(from, to) { return M.angleDiff(from, to); }
  approach(cur, target, maxStep) { return M.approach(cur, target, maxStep); }
  approachAngle(cur, target, maxStep) { return M.approachAngle(cur, target, maxStep); }
  rotateAround(point, center, angle) { return M.rotateAround(point, center, angle); }
  lerp(a, b, t) { return M.lerp(a, b, t); }
  clamp(v, lo, hi) { return M.clamp(v, lo, hi); }

  get ease() { return M.ease; }

  // ── 경로 (배치와 이동 양쪽에서 쓴다) ──────────────────────────────

  pathCircle(radius, opts) { return M.pathCircle(radius, opts); }
  /**
   * 정다각형 궤도. firePath나 motion:'path'에 넣는다.
   * @param {number} sides 변의 수
   * @param {number} radius 크기
   * @param {{center?: {x: number, y: number}, rotation?: number}} [opts]
   * @returns {(t: number) => {x: number, y: number}}
   */
  pathPolygon(sides, radius, opts) { return M.pathPolygon(sides, radius, opts); }
  pathStar(points, inner, outer, opts) { return M.pathStar(points, inner, outer, opts); }
  pathLine(from, to) { return M.pathLine(from, to); }
  pathLissajous(a, b, opts) { return M.pathLissajous(a, b, opts); }
  pathRose(k, radius, opts) { return M.pathRose(k, radius, opts); }
  pathBezier(p0, p1, p2, p3) { return M.pathBezier(p0, p1, p2, p3); }
  pathTangent(path, t) { return M.pathTangent(path, t); }

  // ── 난수 ──────────────────────────────────────────────────────────

  /** 반지름 radius 원 안의 균일 분포 점 */
  randCircle(radius, origin) {
    const a = this.rand(0, TAU);
    const d = radius * Math.sqrt(this.rand(0, 1));
    return M.polar(a, d, origin);
  }

  /** 필드 가장자리의 임의 점 */
  randEdge(margin = 0) {
    const { left, right, top, bottom } = this.bounds;
    switch (this.randInt(0, 3)) {
      case 0: return { x: this.rand(left, right), y: top + margin };
      case 1: return { x: this.rand(left, right), y: bottom - margin };
      case 2: return { x: left + margin, y: this.rand(top, bottom) };
      default: return { x: right - margin, y: this.rand(top, bottom) };
    }
  }

  randSign() { return this.rand(0, 1) < 0.5 ? -1 : 1; }
  randAngle() { return this.rand(0, TAU); }

  /** 시드 고정 셔플 (원본을 건드리지 않는다) */
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.randInt(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  /** [[값, 가중치], ...] 중 하나 */
  weighted(pairs) {
    let total = 0;
    for (const [, w] of pairs) total += w;
    let r = this.rand(0, total);
    for (const [v, w] of pairs) {
      r -= w;
      if (r <= 0) return v;
    }
    return pairs[pairs.length - 1][0];
  }

  // ── 색 ────────────────────────────────────────────────────────────
  //
  // 그라데이션은 oklch를 권한다. hsv는 색상을 돌리면 밝기가 들쭉날쭉하지만
  // oklch는 같은 l 값이면 어느 색상이든 비슷한 밝기로 보인다.

  /**
   * @param {number} h 색상 0~360
   * @param {number} [s] 채도 0~1
   * @param {number} [v] 명도 0~1
   * @returns {string} '#rrggbb'
   */
  hsv(h, s = 1, v = 1) { return COLOR.hsv(h, s, v); }
  hsl(h, s = 1, l = 0.5) { return COLOR.hsl(h, s, l); }
  /**
   * 지각적으로 균일한 색. 그라데이션에 권장.
   * @param {number} l 밝기 0~1 (탄은 0.75~0.88이 잘 보인다)
   * @param {number} c 채도 0~0.37
   * @param {number} h 색상 0~360
   * @returns {string} '#rrggbb'
   */
  oklch(l, c, h) { return COLOR.oklch(l, c, h); }
  /**
   * 두 색을 섞는다 (OKLab).
   * @param {string} a
   * @param {string} b
   * @param {number} t 0이면 a, 1이면 b
   * @returns {string} '#rrggbb'
   */
  mix(a, b, t) { return COLOR.mix(a, b, t); }
  gradient(colors, opts) { return COLOR.gradient(colors, opts); }
  hueShift(color, deg) { return COLOR.hueShift(color, deg); }
  lightenColor(color, amount) { return COLOR.lighten(color, amount); }
  /**
   * 무지개 한 바퀴.
   * @param {number} t 0~1
   * @param {{l?: number, c?: number}} [opts]
   * @returns {string} '#rrggbb'
   */
  rainbow(t, opts) { return COLOR.rainbow(t, opts); }

  // ── 태스크 조합기 ─────────────────────────────────────────────────

  /** interval 프레임마다 fn을 실행하는 태스크. fn(i)가 false를 돌려주면 멈춘다. */
  /**
   * interval 프레임마다 fn 실행 (바로 한 번 실행하고 시작한다).
   * 리듬이 조금이라도 복잡하면 fork + yield 를 쓰는 편이 낫다.
   * @param {number} interval 프레임 간격
   * @param {(i: number, s: Stage) => any} fn false를 돌려주면 멈춘다
   * @param {number} [times] 반복 횟수 (기본 무한)
   * @param {{alive: boolean}} [owner]
   * @returns {{done: boolean}}
   */
  every(interval, fn, times = Infinity, owner = null) {
    const self = this;
    return this.fork(function* () {
      for (let i = 0; i < times; i++) {
        if (fn(i, self) === false) return;
        yield interval;
      }
    }(), owner);
  }

  /** frames 프레임 뒤에 한 번 */
  /**
   * frames 프레임 뒤에 fn을 한 번 실행한다.
   * @param {number} frames
   * @param {(s: Stage) => void} fn
   * @param {{alive: boolean}} [owner]
   * @returns {{done: boolean}}
   */
  after(frames, fn, owner = null) {
    const self = this;
    return this.fork(function* () {
      yield frames;
      fn(self);
    }(), owner);
  }

  /** gap 간격으로 count번 연사 */
  /**
   * gap 간격으로 count번 연사한다.
   * @param {{count?: number, gap?: number, fn: (i: number, s: Stage) => any, owner?: {alive: boolean}}} opts
   * @returns {{done: boolean}}
   */
  burst({ count = 3, gap = 6, fn, owner = null }) {
    return this.every(gap, fn, count, owner);
  }

  /** from에서 to까지 frames에 걸쳐 보간하며 매 프레임 fn(값, t) */
  ramp(from, to, frames, fn, easeName = 'linear', owner = null) {
    const e = M.ease[easeName] ?? M.ease.linear;
    return this.fork(function* () {
      for (let i = 1; i <= frames; i++) {
        const t = i / frames;
        fn(M.lerp(from, to, e(t)), t);
        yield;
      }
    }(), owner);
  }

  /** n번 즉시 반복 (대기 없음) */
  times(n, fn) {
    for (let i = 0; i < n; i++) fn(i, n);
  }

  /** yield* s.parallel(a(s), b(s)) — 전부 끝날 때까지 */
  *parallel(...gens) {
    const tasks = gens.map((g) => this.fork(g));
    yield () => tasks.every((t) => t.done);
  }

  /** yield* s.sequence(a(s), b(s)) — 차례로 */
  *sequence(...gens) {
    for (const g of gens) yield* g;
  }

  // ── 시간 ──────────────────────────────────────────────────────────

  /** yield s.wait(30) — 그냥 yield 30 과 같다. 읽기 좋으라고 있는 것. */
  /**
   * yield s.wait(30) — 그냥 yield 30 과 같다.
   * @param {number} frames
   */
  wait(frames) { return frames; }

  /** yield s.until(() => boss.hp < 500) */
  /**
   * yield s.until(() => 조건) — 조건이 참이 될 때까지 기다린다.
   * @param {() => boolean} predicate
   */
  until(predicate) { return predicate; }

  /** 태스크가 끝날 때까지 대기: yield s.join(task) */
  join(task) { return () => task.done; }

  /** 게이지가 v 이하가 될 때까지: yield s.untilGauge(0.5) */
  untilGauge(v) { return () => this.gauge <= v; }

  /** 다음 임계점을 넘을 때까지: yield s.untilPhaseChange() */
  /** yield s.untilPhaseChange() — 다음 임계점을 넘을 때까지 기다린다. */
  untilPhaseChange() {
    const from = this.phase;
    return () => this.phase !== from || !!this.result;
  }

  // ── 태스크 ────────────────────────────────────────────────────────

  /**
   * 병렬 태스크를 띄운다. genOrFn은 제너레이터이거나 제너레이터를 만드는 함수.
   * owner를 주면 그 객체가 죽을 때 태스크도 같이 끝난다.
   */
  /**
   * 공격 하나를 병렬로 돌린다. 공격 하나 = function* 하나.
   * @param {Generator|((s: Stage) => Generator)} genOrFn
   * @param {{alive: boolean}} [owner] 이게 죽으면 태스크도 끝난다 (보통 s.boss)
   * @returns {{done: boolean}} s.cancel()에 넣을 수 있는 태스크
   */
  fork(genOrFn, owner = null) {
    const gen = typeof genOrFn === 'function' ? genOrFn(this) : genOrFn;
    return this.scheduler.add(gen, owner);
  }

  /**
   * fork로 띄운 태스크를 멈춘다. 그 안에서 fork한 것까지 함께 정리된다.
   * @param {{done: boolean}} task
   */
  cancel(task) { this.scheduler.cancel(task); }

  // ── 적 ────────────────────────────────────────────────────────────

  /**
   * 잡몹을 만든다 (보스는 엔진이 이미 만들어 s.boss로 준다).
   * @param {EnemyOptions} opts
   * @returns {import('./enemy.js').Enemy}
   */
  spawn(opts = {}) {
    const enemy = new Enemy(opts);
    this.enemies.push(enemy);
    if (enemy.isBoss) this.boss = enemy;
    // 적 스스로 움직이는 루틴을 붙이기 편하도록.
    enemy.fork = (genOrFn) => this.fork(genOrFn, enemy);
    return enemy;
  }

  // ── 발사 ──────────────────────────────────────────────────────────
  //
  // 모든 fire* 는 같은 공통 옵션을 받는다.
  //   origin / center : 배치 기준점 (없으면 x, y. 그것도 없으면 (0,0))
  //   rotation        : 배치 전체를 기준점 중심으로 회전
  //   facing          : 각 탄의 방향. 'out' | 'in' | 'aim' | 'along'(접선) | 숫자(절대각)
  //   aimType         : 'absolute'(기본) | 'aim'(플레이어 기준 오프셋) | 'sequence'(직전 발사각 기준)
  //   jitter          : 위치를 이만큼 흩뿌린다
  //   ramp            : { speed:[a,b], size:[a,b], color:[c1,c2] | (t)=>색, ... } i에 따라 배분
  //   each            : (bullet, i, count) => void, 생성 직후 콜백
  // 그 밖의 키는 전부 탄 속성으로 넘어간다.

  /**
   * 탄 하나를 쏜다.
   * @param {FireOptions} opts
   * @returns {import('./bullets.js').Bullet | null}
   */
  fire(opts) {
    return this._emit([{ x: 0, y: 0, angle: opts.angle ?? 0, tangent: 0 }], opts)[0] ?? null;
  }

  /**
   * 원형 일제사. count발이 360도에 고르게 퍼진다.
   * @param {FireOptions} opts angle=첫 탄 각도, radius=중심에서 띄울 거리
   * @returns {import('./bullets.js').Bullet[]}
   */
  fireRing(opts = {}) {
    return this._emit(L.ringPoints(opts), opts);
  }

  /**
   * 부채꼴로 쏜다.
   * @param {FireOptions} opts angle=중심각, spread=전체 벌어짐 각(라디안)
   * @returns {import('./bullets.js').Bullet[]}
   */
  fireFan(opts = {}) {
    return this._emit(L.fanPoints(opts), opts);
  }

  /**
   * 선분 위에 등간격으로 배치해 쏜다.
   * @param {FireOptions} opts from/to = 선분의 양 끝
   * @returns {import('./bullets.js').Bullet[]}
   */
  fireLine(opts = {}) {
    return this._emit(L.linePoints(opts), opts);
  }

  /**
   * 원호 위에 배치해 쏜다.
   * @param {FireOptions & {from?: number, to?: number}} opts from/to = 시작·끝 각도(라디안)
   * @returns {import('./bullets.js').Bullet[]}
   */
  fireArcAt(opts = {}) {
    return this._emit(L.arcPoints(opts), { facing: 'out', ...opts });
  }

  /**
   * 정다각형 모양으로 배치해 쏜다. 모양 그대로 커지게 하려면 keepShape: true.
   * @param {FireOptions} opts sides=변 수, radius=크기, perSide=변마다 발 수
   * @returns {import('./bullets.js').Bullet[]}
   */
  firePolygon(opts = {}) {
    return this._emit(L.polygonPoints(opts), { facing: 'out', ...opts });
  }

  /**
   * 별 모양으로 배치해 쏜다.
   * @param {FireOptions} opts points=뿔 수, inner/outer=안팎 반지름
   * @returns {import('./bullets.js').Bullet[]}
   */
  fireStar(opts = {}) {
    return this._emit(L.starPoints(opts), { facing: 'out', ...opts });
  }

  /**
   * 격자로 배치해 쏜다.
   * @param {FireOptions} opts cols/rows=열·행, gapX/gapY=간격
   * @returns {import('./bullets.js').Bullet[]}
   */
  fireGrid(opts = {}) {
    return this._emit(L.gridPoints(opts), opts);
  }

  /**
   * 임의 경로 위에 배치해 쏜다. path는 s.pathPolygon() 등으로 만든다.
   * @param {(t: number) => {x: number, y: number}} path t는 0~1
   * @param {FireOptions} opts
   * @returns {import('./bullets.js').Bullet[]}
   */
  firePath(path, opts = {}) {
    return this._emit(L.pathPoints(path, opts), opts);
  }

  /** 배치된 점들을 실제 탄으로 만든다. */
  /**
   * 배치된 점들을 실제 탄으로 만든다.
   * @param {Array<{x: number, y: number, angle?: number, tangent?: number}>} points
   * @param {FireOptions} opts
   * @returns {import('./bullets.js').Bullet[]}
   */
  _emit(points, opts) {
    const origin = opts.origin ?? opts.center ?? { x: opts.x ?? 0, y: opts.y ?? 0 };
    const rotation = opts.rotation ?? 0;
    const { facing, jitter = 0, ramp, each, aimType } = opts;
    const n = points.length;
    const out = [];

    const base = {};
    for (const key of BULLET_KEYS) if (key in opts) base[key] = opts[key];

    const cos = rotation ? Math.cos(rotation) : 1;
    const sin = rotation ? Math.sin(rotation) : 0;

    // keepShape: 배치가 모양 그대로 확대되도록 기준점에서 먼 탄일수록 빠르게 한다.
    // (facing: 'out' 만 쓰면 모든 탄이 같은 속도로 방사상 이동해서 모서리가 뭉개진다)
    let maxDist = 0;
    if (opts.keepShape) {
      for (const p of points) maxDist = Math.max(maxDist, Math.hypot(p.x, p.y));
    }

    for (let i = 0; i < n; i++) {
      const p = points[i];
      const lx = rotation ? p.x * cos - p.y * sin : p.x;
      const ly = rotation ? p.x * sin + p.y * cos : p.y;

      const x = origin.x + lx + (jitter ? this.rand(-jitter, jitter) : 0);
      const y = origin.y + ly + (jitter ? this.rand(-jitter, jitter) : 0);

      let angle;
      if (facing === undefined) angle = (p.angle ?? opts.angle ?? 0) + rotation;
      else if (typeof facing === 'number') angle = facing;
      else if (facing === 'along') angle = (p.tangent ?? p.angle ?? 0) + rotation;
      else if (facing === 'normal') {
        // 변(접선)의 수직 방향, 바깥쪽. 다각형이 모양을 유지한 채 커진다.
        // ('out'은 중심에서 방사상이라 꼭짓점 쪽이 늘어난다)
        const t = (p.tangent ?? p.angle ?? 0) + rotation;
        angle = t + Math.PI / 2;
        // 중심 반대쪽을 향하도록 보정
        if (Math.cos(angle) * lx + Math.sin(angle) * ly < 0) angle += Math.PI;
      }
      else if (facing === 'aim') angle = Math.atan2(this.player.y - y, this.player.x - x);
      else if (facing === 'in' || facing === 'out') {
        const away = lx === 0 && ly === 0
          ? (p.angle ?? 0) + rotation
          : Math.atan2(y - origin.y, x - origin.x);
        angle = facing === 'out' ? away : away + Math.PI;
      } else angle = (p.angle ?? 0) + rotation;

      if (aimType === 'aim') angle += Math.atan2(this.player.y - y, this.player.x - x);
      else if (aimType === 'sequence') angle += this.lastAngle;

      if (this.frame < 180) this.checkAngleUnit(angle);

      /** @type {FireOptions & {x: number, y: number, angle: number}} */
      const props = { ...base, x, y, angle };
      if (ramp) applyRamp(props, ramp, n > 1 ? i / (n - 1) : 0);
      if (opts.keepShape && maxDist > 0) {
        props.speed = (props.speed ?? 0) * (Math.hypot(p.x, p.y) / maxDist);
      }

      const b = this.bullets.spawn(props);
      if (b) {
        this.stats.fired++;
        this.lastAngle = angle;
        if (each) each(b, i, n);
        out.push(b);
      }
    }

    // 소리는 탄 하나마다가 아니라 이 발사 한 번에 대해 한 번만 낸다.
    // sound: false 로 끄거나, sound: 'orb' 처럼 다른 소리를 쓸 수 있다.
    if (out.length && opts.sound !== false) {
      const first = out[0];
      audio.bullets(opts.sound ?? first.shape, out.length, first.size);
    }
    return out;
  }

  /**
   * 각도 자리에 도(°)를 그대로 넣는 실수를 잡는다.
   * 한 바퀴가 6.28(라디안)인데 25를 넘는 값이 오면 90, 359 같은 도 값일 가능성이 크다.
   * 판 시작 후 3초 동안만 보고, 한 번만 알린다 (angle += 로 누적된 값을 오해하지 않도록).
   */
  checkAngleUnit(angle) {
    if (this.angleWarned || Math.abs(angle) < 25 || !Number.isFinite(angle)) return;
    this.angleWarned = true;
    console.warn(
      `[danmaku] angle 에 ${angle.toFixed(1)} 이 들어왔습니다. 각도는 라디안이라 한 바퀴가 ${TAU.toFixed(2)} 입니다.
` +
      `  도(°)를 쓰셨다면 s.deg(...) 로 감싸세요.  예: angle: s.deg(90)  /  s.rand(0, s.TAU)`,
    );
  }

  /** 탄 배열을 나중에 한꺼번에 조작하기 위한 래퍼 */
  /**
   * 쏜 탄들을 한 묶음으로 잡아 둔다. 나중에 g.each() 등으로 한꺼번에 조작.
   * @param {import('./bullets.js').Bullet[]|import('./bullets.js').Bullet} bullets fire*가 돌려준 배열
   * @returns {import('./group.js').BulletGroup}
   */
  group(bullets) {
    return new BulletGroup(Array.isArray(bullets) ? bullets : [bullets]);
  }

  /** 예약 변경을 심는다. target은 탄 하나, 배열, 또는 group. */
  /**
   * 예약 변경을 심는다. [{ at: 60, speed: 0 }, { at: 90, angle: 'aim' }]
   * @param {any} target 탄, 탄 배열, 또는 group
   * @param {Array<Record<string, any>>} steps at은 탄의 나이(프레임)
   */
  plan(target, steps) {
    const list = target instanceof BulletGroup ? target.bullets
      : Array.isArray(target) ? target : [target];
    for (const b of list) {
      if (!b) continue;
      b.plan = steps;
      b.pi = 0;
    }
    return target;
  }

  /** 화면의 모든 적탄 제거 (bombProof 포함) */
  /** 화면의 적탄을 전부 지운다 (bombProof 포함). */
  clearBullets() {
    this.bullets.clear();
  }

  /** 폭발에 면역(bombProof)이 아닌 탄만 지운다. */
  clearBombable() {
    for (const b of this.bullets.active) {
      if (!b.bombProof) b.alive = false;
    }
    this.bullets.compact();
  }

  // ── 폭탄 / 피격 ───────────────────────────────────────────────────

  /** 화면의 탄을 날리고 1초 무적. 죽었을 때도 같은 효과가 자동으로 걸린다. */
  bomb() {
    this.stats.bombs++;
    this.clearBombable();
    this.player.grantInvuln(BOMB_INVULN);
    this.addShake(...BOMB_SHAKE);
    audio.event('bomb');
  }

  /** 현재 흔들림 진폭. 지속 시간에 걸쳐 선형으로 잦아든다. */
  get shake() {
    return this.shakeLeft > 0 ? this.shakeAmp * (this.shakeLeft / this.shakeTotal) : 0;
  }

  /** 더 센 흔들림이 이미 걸려 있으면 덮어쓰지 않는다. */
  /**
   * 화면을 흔든다. 폭탄은 (10, 24), 사망은 (7, 20).
   * @param {number} amount 진폭(px)
   * @param {number} [frames] 지속 프레임
   */
  addShake(amount, frames = 18) {
    if (amount < this.shake) return;
    this.shakeAmp = amount;
    this.shakeTotal = Math.max(1, frames);
    this.shakeLeft = this.shakeTotal;
  }

  // ── 도움말 ────────────────────────────────────────────────────────

  /**
   * 콘솔에 쓸 수 있는 것 전부를 묶어서 찍는다.
   *   engine.stage.help()        전체 목록
   *   engine.stage.help('fire')  이름에 fire가 들어간 것만
   */
  help(filter = '') {
    const groups = {
      '발사': ['fire', 'fireRing', 'fireFan', 'fireLine', 'fireArcAt', 'firePolygon', 'fireStar', 'fireGrid', 'firePath'],
      '탄 조작': ['group', 'plan', 'clearBullets', 'clearBombable', 'bomb'],
      '대기 (yield와 함께)': ['wait', 'until', 'untilGauge', 'untilPhaseChange', 'join'],
      '병렬 태스크': ['fork', 'cancel', 'every', 'after', 'burst', 'ramp', 'times', 'parallel', 'sequence'],
      '적': ['spawn'],
      '각도·좌표': ['deg', 'aim', 'angleTo', 'polar', 'dist', 'wrapAngle', 'angleDiff', 'approach', 'approachAngle', 'rotateAround', 'lerp', 'clamp'],
      '경로': ['pathCircle', 'pathPolygon', 'pathStar', 'pathLine', 'pathLissajous', 'pathRose', 'pathBezier', 'pathTangent'],
      '난수': ['rand', 'randInt', 'pick', 'randCircle', 'randEdge', 'randSign', 'randAngle', 'shuffle', 'weighted'],
      '색': ['hsv', 'hsl', 'oklch', 'mix', 'gradient', 'hueShift', 'lightenColor', 'rainbow'],
      '연출': ['addShake'],
    };
    const values = {
      '읽기 전용': ['boss', 'player', 'px', 'py', 'enemies', 'frame', 'gauge', 'phase', 'remaining',
        'bulletCount', 'bounds', 'mode', 'thresholds', 'result', 'C', 'ease', 'TAU', 'PI'],
    };

    const f = filter.toLowerCase();
    const hit = (n) => !f || n.toLowerCase().includes(f);

    console.log('%c탄막 API (s.___)', 'font-weight:bold;font-size:13px');
    for (const [title, names] of Object.entries(groups)) {
      const list = names.filter(hit);
      if (list.length) console.log(`%c${title}%c  ${list.map((n) => `s.${n}()`).join('  ')}`,
        'color:#7fd0ff;font-weight:bold', 'color:inherit');
    }
    for (const [title, names] of Object.entries(values)) {
      const list = names.filter(hit);
      if (list.length) console.log(`%c${title}%c  ${list.map((n) => `s.${n}`).join('  ')}`,
        'color:#ffd27f;font-weight:bold', 'color:inherit');
    }

    // 목록에 없는 게 생기면 여기서 드러난다.
    const known = new Set([...Object.values(groups).flat(), ...Object.values(values).flat()]);
    const rest = Object.getOwnPropertyNames(Stage.prototype)
      .filter((n) => n !== 'constructor' && !n.startsWith('_') && !known.has(n) && hit(n));
    if (rest.length) console.log('%c기타%c  ' + rest.join('  '), 'color:#8fa0bb', 'color:inherit');

    if (!f || '색'.includes(f) || 'color'.includes(f) || 'c'.startsWith(f)) {
      const swatches = Object.keys(C).map((k) => `%c ${k} `).join('');
      console.log(
        `%c팔레트(s.C)%c  ${swatches}`,
        'color:#ffd27f;font-weight:bold', 'color:inherit',
        ...Object.values(C).map((v) => `background:${v};color:#111;border-radius:2px`),
      );
    }
    console.log('%c치트시트: docs/cheatsheet.md   전체 명세: docs/patterns.md', 'color:#7d8ba3');
    return undefined;
  }

  // ── 진행 ──────────────────────────────────────────────────────────

  update(input) {
    if (this.result) {
      // 클리어 후에도 화면은 계속 그려지지만 시뮬레이션은 멈춘다.
      if (this.shakeLeft > 0) this.shakeLeft--;
      return;
    }

    this.frame++;
    if (this.shakeLeft > 0) this.shakeLeft--;

    if (input.pressed('bomb')) this.bomb();

    this.scheduler.update();
    this.player.update(input);
    this.bullets.update(this.api);

    let n = 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;
      e.age++;
      this.enemies[n++] = e;
    }
    this.enemies.length = n;

    this.collide();
    this.checkClear();
  }

  collide() {
    const player = this.player;

    // 플레이어 탄 vs 적
    for (const shot of player.shots) {
      if (!shot.alive) continue;
      for (const e of this.enemies) {
        if (!e.alive || e.invuln) continue;
        if (e.overlaps(shot)) {
          e.damage(shot.damage, this);
          shot.alive = false;
          break;
        }
      }
    }

    // 적탄 vs 플레이어 (스침 판정 포함)
    const grazeSq = GRAZE_RADIUS * GRAZE_RADIUS;
    for (const b of this.bullets.active) {
      if (!b.alive || b.delay > 0) continue;   // 등장 대기 중인 탄은 판정 없음
      const dx = b.x - player.x;
      const dy = b.y - player.y;
      const distSq = dx * dx + dy * dy;

      const hitR = b.r + player.r;
      if (distSq <= hitR * hitR) {
        if (player.hit()) {
          // 사망 = 화면 흔들림 + 폭탄 효과 (폭탄 사용 횟수에는 안 들어간다)
          this.clearBombable();
          this.addShake(...DEATH_SHAKE);
          audio.event('death');
          return;
        }
        continue;
      }

      if (!b.grazed && !player.invulnerable && distSq <= grazeSq) {
        b.grazed = true;
        player.graze++;
      }
    }
  }

  checkClear() {
    if (this.result) return;

    if (this.mode === 'survival') {
      if (this.frame >= this.duration) this.finish();
      return;
    }
    if (this.boss && !this.boss.alive) this.finish();
  }

  finish() {
    this.cancel(this.mainTask);
    this.clearBullets();
    for (const e of this.enemies) e.kill(this);
    this.enemies.length = 0;

    const fired = this.stats.fired;
    this.result = {
      frames: this.frame,
      seconds: this.frame / FPS,
      bombs: this.stats.bombs,
      deaths: this.player.deaths,
      graze: this.player.graze,
      fired,
      grazeRatio: fired > 0 ? this.player.graze / fired : 0,
    };
    this.finished = true;
  }
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * ramp 옵션을 i번째 탄(t: 0~1)에 적용한다.
 *   { speed: [1, 3] }        숫자 보간
 *   { color: ['#f00','#00f'] } 색 보간 (OKLab)
 *   { size: (t) => 2 + t * 3 } 함수
 */
function applyRamp(props, ramp, t) {
  for (const key in ramp) {
    const v = ramp[key];
    if (typeof v === 'function') props[key] = v(t);
    else if (Array.isArray(v) && v.length >= 2) {
      props[key] = typeof v[0] === 'number'
        ? v[0] + (v[1] - v[0]) * t
        : COLOR.mix(v[0], v[1], t);
    }
  }
}

/** [0.66, 0.33] 또는 [1200, 600] 같은 입력을 0~1 비율 배열로 바꾼다. */
function normalizeThresholds(list, total) {
  if (!Array.isArray(list) || total <= 0) return [];
  return list
    .map((v) => (v > 1 ? v / total : v))
    .filter((v) => v > 0 && v < 1)
    .sort((a, b) => b - a);
}
