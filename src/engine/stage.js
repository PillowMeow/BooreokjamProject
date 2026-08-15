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

// 탄에 그대로 넘길 수 있는 필드. 배치용 옵션(origin, facing 등)이 탄에 섞이지 않게 화이트리스트로 거른다.
const BULLET_KEYS = [
  'speed', 'accel', 'omega', 'minSpeed', 'maxSpeed',
  'r', 'size', 'shape', 'color', 'life', 'bombProof',
  'onUpdate', 'data', 'delay', 'motion', 'plan',
];

// 화면 흔들림: [진폭(px), 지속 프레임]
const DEATH_SHAKE = [7, 20];
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

    if (typeof this.pattern.init === 'function') this.pattern.init(this);
    this.mainTask = this.scheduler.add(this.pattern.main(this));
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

  /** from에서 플레이어를 향하는 각도 */
  aim(from) {
    return Math.atan2(this.player.y - from.y, this.player.x - from.x);
  }

  angleTo(from, to) {
    return Math.atan2(to.y - from.y, to.x - from.x);
  }

  deg(d) { return (d * Math.PI) / 180; }

  rand(min = 0, max = 1) { return this.rng.range(min, max); }
  randInt(min, max) { return this.rng.int(min, max); }
  pick(arr) { return this.rng.pick(arr); }

  // ── 좌표·각도 ─────────────────────────────────────────────────────

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

  hsv(h, s = 1, v = 1) { return COLOR.hsv(h, s, v); }
  hsl(h, s = 1, l = 0.5) { return COLOR.hsl(h, s, l); }
  oklch(l, c, h) { return COLOR.oklch(l, c, h); }
  mix(a, b, t) { return COLOR.mix(a, b, t); }
  gradient(colors, opts) { return COLOR.gradient(colors, opts); }
  hueShift(color, deg) { return COLOR.hueShift(color, deg); }
  lightenColor(color, amount) { return COLOR.lighten(color, amount); }
  rainbow(t, opts) { return COLOR.rainbow(t, opts); }

  // ── 태스크 조합기 ─────────────────────────────────────────────────

  /** interval 프레임마다 fn을 실행하는 태스크. fn(i)가 false를 돌려주면 멈춘다. */
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
  after(frames, fn, owner = null) {
    const self = this;
    return this.fork(function* () {
      yield frames;
      fn(self);
    }(), owner);
  }

  /** gap 간격으로 count번 연사 */
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
  wait(frames) { return frames; }

  /** yield s.until(() => boss.hp < 500) */
  until(predicate) { return predicate; }

  /** 태스크가 끝날 때까지 대기: yield s.join(task) */
  join(task) { return () => task.done; }

  /** 게이지가 v 이하가 될 때까지: yield s.untilGauge(0.5) */
  untilGauge(v) { return () => this.gauge <= v; }

  /** 다음 임계점을 넘을 때까지: yield s.untilPhaseChange() */
  untilPhaseChange() {
    const from = this.phase;
    return () => this.phase !== from || !!this.result;
  }

  // ── 태스크 ────────────────────────────────────────────────────────

  /**
   * 병렬 태스크를 띄운다. genOrFn은 제너레이터이거나 제너레이터를 만드는 함수.
   * owner를 주면 그 객체가 죽을 때 태스크도 같이 끝난다.
   */
  fork(genOrFn, owner = null) {
    const gen = typeof genOrFn === 'function' ? genOrFn(this) : genOrFn;
    return this.scheduler.add(gen, owner);
  }

  cancel(task) { this.scheduler.cancel(task); }

  // ── 적 ────────────────────────────────────────────────────────────

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

  /** 탄 하나. */
  fire(opts) {
    return this._emit([{ x: 0, y: 0, angle: opts.angle ?? 0 }], opts)[0] ?? null;
  }

  /** 원형 일제사. { count, angle(시작각), radius(중심에서 띄우기) } */
  fireRing(opts = {}) {
    return this._emit(L.ringPoints(opts), opts);
  }

  /** 부채꼴. spread는 전체 벌어짐 각(라디안), angle은 중심각. */
  fireFan(opts = {}) {
    return this._emit(L.fanPoints(opts), opts);
  }

  /** 선분 위 등간격 배치. { from, to, count } — from/to는 origin 기준(기본 절대좌표) */
  fireLine(opts = {}) {
    return this._emit(L.linePoints(opts), opts);
  }

  /** 원호 위 배치. { radius, from, to, count } */
  fireArcAt(opts = {}) {
    return this._emit(L.arcPoints(opts), { facing: 'out', ...opts });
  }

  /** 정다각형 배치. { sides, radius, perSide, mode: 'outline'|'vertex' } */
  firePolygon(opts = {}) {
    return this._emit(L.polygonPoints(opts), { facing: 'out', ...opts });
  }

  /** 별 배치. { points, inner, outer, perEdge } */
  fireStar(opts = {}) {
    return this._emit(L.starPoints(opts), { facing: 'out', ...opts });
  }

  /** 격자 배치. { cols, rows, gapX, gapY } */
  fireGrid(opts = {}) {
    return this._emit(L.gridPoints(opts), opts);
  }

  /** 임의 경로 위 배치. path는 t(0~1) => {x, y} */
  firePath(path, opts = {}) {
    return this._emit(L.pathPoints(path, opts), opts);
  }

  /** 배치된 점들을 실제 탄으로 만든다. */
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
      else if (facing === 'aim') angle = Math.atan2(this.player.y - y, this.player.x - x);
      else if (facing === 'in' || facing === 'out') {
        const away = lx === 0 && ly === 0
          ? (p.angle ?? 0) + rotation
          : Math.atan2(y - origin.y, x - origin.x);
        angle = facing === 'out' ? away : away + Math.PI;
      } else angle = (p.angle ?? 0) + rotation;

      if (aimType === 'aim') angle += Math.atan2(this.player.y - y, this.player.x - x);
      else if (aimType === 'sequence') angle += this.lastAngle;

      const props = { ...base, x, y, angle };
      if (ramp) applyRamp(props, ramp, n > 1 ? i / (n - 1) : 0);

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

  /** 탄 배열을 나중에 한꺼번에 조작하기 위한 래퍼 */
  group(bullets) {
    return new BulletGroup(Array.isArray(bullets) ? bullets : [bullets]);
  }

  /** 예약 변경을 심는다. target은 탄 하나, 배열, 또는 group. */
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
  addShake(amount, frames = 18) {
    if (amount < this.shake) return;
    this.shakeAmp = amount;
    this.shakeTotal = Math.max(1, frames);
    this.shakeLeft = this.shakeTotal;
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
    this.bullets.update(this);

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
