export class Enemy {
  constructor(opts = {}) {
    this.x = opts.x ?? 0;
    this.y = opts.y ?? -140;

    // 스프라이트가 있으면 히트박스는 그 이미지의 바운딩박스(= 이미지 크기) 사각형이다.
    // 없으면 반지름 r인 원.
    this.sprite = opts.sprite ?? null;
    if (this.sprite) {
      const scale = opts.spriteScale ?? 1;
      this.w = (opts.w ?? this.sprite.naturalWidth) * scale;
      this.h = (opts.h ?? this.sprite.naturalHeight) * scale;
      this.r = Math.max(this.w, this.h) / 2;   // 참고값
    } else {
      this.w = opts.w ?? 0;
      this.h = opts.h ?? 0;
      this.r = opts.r ?? 16;
    }

    this.maxHp = opts.hp ?? 100;
    this.hp = this.maxHp;
    this.color = opts.color ?? '#ffffff';
    this.invuln = opts.invuln ?? false;   // true면 플레이어 탄에 안 맞음
    this.isBoss = opts.boss ?? false;     // true면 화면 최상단 게이지에 표시된다
    this.alive = true;
    this.age = 0;
    this.onDeath = opts.onDeath ?? null;  // (enemy, stage) => void
    this.data = opts.data ?? null;
  }

  /** 사각 히트박스를 쓰는가 */
  get isRect() {
    return this.w > 0 && this.h > 0;
  }

  damage(amount, stage) {
    if (!this.alive || this.invuln) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.kill(stage);
    }
  }

  kill(stage) {
    if (!this.alive) return;
    this.alive = false;
    if (this.onDeath) this.onDeath(this, stage);
  }

  /** 원/사각 판정을 한 번에 처리한다. (other는 x, y, r을 가진 무엇이든) */
  overlaps(other) {
    if (this.isRect) {
      const dx = Math.abs(other.x - this.x) - this.w / 2;
      const dy = Math.abs(other.y - this.y) - this.h / 2;
      if (dx <= 0 && dy <= 0) return true;
      const cx = Math.max(0, dx);
      const cy = Math.max(0, dy);
      return cx * cx + cy * cy <= other.r * other.r;
    }
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    const rr = this.r + other.r;
    return dx * dx + dy * dy <= rr * rr;
  }

  // 목표 지점까지 frames 프레임에 걸쳐 이동하는 제너레이터. stage.fork(...)로 돌려 쓴다.
  *moveTo(x, y, frames = 60, ease = easeInOut) {
    const sx = this.x;
    const sy = this.y;
    for (let i = 1; i <= frames; i++) {
      const t = ease(i / frames);
      this.x = sx + (x - sx) * t;
      this.y = sy + (y - sy) * t;
      yield;
    }
  }
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}

export { easeInOut };
