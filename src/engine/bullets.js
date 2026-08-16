import { LEFT, RIGHT, TOP, BOTTOM, CULL_MARGIN, MAX_BULLETS } from './config.js';
import { applyPlan, applyTweens, stepMotion, motionOwnsPosition } from './motion.js';

// 속도 단위는 "프레임당 픽셀". 60fps 기준이라 speed: 3 이면 초당 180px.

export class Bullet {
  constructor() {
    this.alive = false;
    this.reset();
  }

  reset() {
    /** 위치 x */
    this.x = 0;
    /** 위치 y (아래쪽이 +) */
    this.y = 0;
    /** 프레임당 픽셀 */
    this.speed = 0;
    /** 진행 방향(라디안). s.deg(90)=아래 */
    this.angle = 0;
    /** 프레임당 속도 증감 */
    this.accel = 0;
    /** 프레임당 각도 증감(라디안). 휘는 탄 */
    this.omega = 0;
    this.minSpeed = -Infinity;
    this.maxSpeed = Infinity;
    /** 판정 반지름 */
    this.r = 2.5;
    /** 그리기 크기 (모양마다 해석이 다르다) */
    this.size = 3;
    /** @type {'circle'|'orb'|'wedge'|'rod'} 탄 모양 */
    this.shape = 'circle';
    /** CSS 색 */
    this.color = '#ff5577';
    /** 태어난 뒤 지난 프레임 수 (읽기용) */
    this.age = 0;
    /** 수명 프레임. 0이면 무제한 */
    this.life = 0;
    /** 이미 스침 판정을 먹었는지 (읽기용) */
    this.grazed = false;
    /** true면 폭탄/사망 효과로 지워지지 않는다 */
    this.bombProof = false;
    /** @type {((b: Bullet, s: import('./stage.js').Stage) => void) | null} 매 프레임 호출 */
    this.onUpdate = null;
    /** @type {any} 패턴이 자유롭게 쓰는 칸 (이름표 등) */
    this.data = null;

    /** 이 거리 이상 필드 밖으로 나가면 제거된다 (기본 CULL_MARGIN=48) */
    this.margin = CULL_MARGIN;
    /** 남은 등장 지연 프레임 (그동안 판정 없음) */
    this.delay = 0;
    this.delayTotal = 0;
    /** @type {import('./stage.js').MotionOptions | null} 거동 모듈 */
    this.motion = null;
    /** @type {any} 거동 모듈이 쓰는 내부 상태 */
    this.ms = null;
    /** @type {import('./stage.js').PlanStep[] | null} 예약 변경 목록 */
    this.plan = null;
    this.pi = 0;
    /** @type {any[] | null} 진행 중인 보간 목록 */
    this.tw = null;
  }
}

export class BulletPool {
  constructor(capacity = MAX_BULLETS) {
    this.capacity = capacity;
    this.items = [];
    this.free = [];
    this.active = [];
  }

  get count() {
    return this.active.length;
  }

  spawn(opts) {
    if (this.active.length >= this.capacity) return null;

    let b;
    if (this.free.length) {
      b = this.free.pop();
      b.reset();
    } else {
      b = new Bullet();
      this.items.push(b);
    }

    b.alive = true;
    Object.assign(b, opts);
    b.delayTotal = b.delay;
    this.active.push(b);
    return b;
  }

  kill(bullet) {
    bullet.alive = false;
  }

  clear() {
    for (const b of this.active) {
      b.alive = false;
      this.free.push(b);
    }
    this.active.length = 0;
  }

  /** alive가 꺼진 탄을 즉시 목록에서 걷어낸다 (탄 수가 바로 반영되도록). */
  compact() {
    let n = 0;
    for (let i = 0; i < this.active.length; i++) {
      const b = this.active[i];
      if (b.alive) this.active[n++] = b;
      else this.free.push(b);
    }
    this.active.length = n;
  }

  update(stage) {
    const active = this.active;
    let n = 0;

    for (let i = 0; i < active.length; i++) {
      const b = active[i];
      if (!b.alive) {
        this.free.push(b);
        continue;
      }

      // 등장 대기 중: 움직이지도, 맞지도 않는다 (예고 표시만 그려진다)
      if (b.delay > 0) {
        b.delay--;
        active[n++] = b;
        continue;
      }

      if (b.plan !== null) applyPlan(b, stage);
      if (b.tw !== null) applyTweens(b);
      if (b.onUpdate) b.onUpdate(b, stage);

      let owned = false;
      if (b.motion !== null) {
        owned = motionOwnsPosition(b.motion);
        stepMotion(b, stage);
      }

      if (b.accel !== 0) {
        b.speed = Math.min(b.maxSpeed, Math.max(b.minSpeed, b.speed + b.accel));
      }
      if (b.omega !== 0) b.angle += b.omega;

      if (!owned) {
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;
      }
      b.age++;

      const expired = b.life > 0 && b.age >= b.life;
      const m = b.margin;
      const outside =
        b.x < LEFT - m || b.x > RIGHT + m ||
        b.y < TOP - m || b.y > BOTTOM + m;

      if (expired || outside || !b.alive) {
        b.alive = false;
        this.free.push(b);
        continue;
      }

      active[n++] = b;
    }

    active.length = n;
  }
}
