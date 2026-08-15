import { LEFT, RIGHT, TOP, BOTTOM, CULL_MARGIN, MAX_BULLETS } from './config.js';
import { applyPlan, applyTweens, stepMotion, motionOwnsPosition } from './motion.js';

// 속도 단위는 "프레임당 픽셀". 60fps 기준이라 speed: 3 이면 초당 180px.

export class Bullet {
  constructor() {
    this.alive = false;
    this.reset();
  }

  reset() {
    this.x = 0;
    this.y = 0;
    this.speed = 0;
    this.angle = 0;
    this.accel = 0;      // 프레임당 속도 증가
    this.omega = 0;      // 프레임당 각도 증가 (라디안)
    this.minSpeed = -Infinity;
    this.maxSpeed = Infinity;
    this.r = 2.5;        // 판정 반지름
    this.size = 3;       // 그리기 크기 (모양마다 해석이 다르다, render.js 참고)
    this.shape = 'circle'; // 'circle' | 'orb' | 'wedge' | 'rod'
    this.color = '#ff5577';
    this.age = 0;
    this.life = 0;       // 0이면 수명 무제한
    this.grazed = false;
    this.bombProof = false; // true면 폭탄/사망 효과로 지워지지 않는다
    this.onUpdate = null; // (bullet, stage) => void
    this.data = null;     // 패턴이 자유롭게 쓰는 칸

    this.delay = 0;       // 남은 등장 지연 프레임 (그동안 판정 없음)
    this.delayTotal = 0;
    this.motion = null;   // 거동 모듈 { type, ... }
    this.ms = null;       // 거동 모듈이 쓰는 상태
    this.plan = null;     // 예약 변경 목록
    this.pi = 0;          // 다음에 적용할 plan 인덱스
    this.tw = null;       // 진행 중인 보간 목록
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
      const outside =
        b.x < LEFT - CULL_MARGIN || b.x > RIGHT + CULL_MARGIN ||
        b.y < TOP - CULL_MARGIN || b.y > BOTTOM + CULL_MARGIN;

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
