import { addTween } from './motion.js';

/**
 * fire* 가 돌려준 탄 배열을 감싸서 나중에 한꺼번에 조작한다.
 *   const g = s.group(s.fireRing({ ... }));
 *   yield 60;
 *   g.changeAngle(a => a + s.deg(90), 30);
 *
 * 모든 메서드는 죽은 탄을 알아서 건너뛰고 자기 자신을 돌려준다(체이닝 가능).
 */
export class BulletGroup {
  constructor(bullets) {
    this.bullets = bullets.filter(Boolean);
  }

  get length() {
    return this.bullets.length;
  }

  /** 아직 살아 있는 탄 수 */
  get alive() {
    let n = 0;
    for (const b of this.bullets) if (b.alive) n++;
    return n;
  }

  each(fn) {
    let i = 0;
    for (const b of this.bullets) {
      if (b.alive) fn(b, i, this.bullets.length);
      i++;
    }
    return this;
  }

  /** 값을 즉시 대입. props의 값으로 (bullet, i) => 값 도 줄 수 있다. */
  set(props) {
    return this.each((b, i, n) => {
      for (const key in props) {
        const v = props[key];
        b[key] = typeof v === 'function' ? v(b, i, n) : v;
      }
      if ('motion' in props) b.ms = null;
    });
  }

  /** to는 숫자 또는 (현재값, bullet, i) => 숫자. frames를 주면 그동안 보간. */
  changeSpeed(to, frames = 0, easeName) {
    return this.tweenKey('speed', to, frames, easeName);
  }

  changeAngle(to, frames = 0, easeName) {
    return this.tweenKey('angle', to, frames, easeName);
  }

  changeSize(to, frames = 0, easeName) {
    return this.tweenKey('size', to, frames, easeName);
  }

  tweenKey(key, to, frames = 0, easeName) {
    return this.each((b, i, n) => {
      const v = typeof to === 'function' ? to(b[key], b, i, n) : to;
      if (frames > 0) addTween(b, key, v, frames, easeName);
      else b[key] = v;
    });
  }

  /** 예약 변경을 그룹 전체에 심는다 */
  plan(steps) {
    return this.each((b) => {
      b.plan = steps;
      b.pi = 0;
    });
  }

  /** 색을 i에 따라 칠한다. fn: (t 0~1, bullet, i) => 색 */
  colorBy(fn) {
    return this.each((b, i, n) => {
      b.color = fn(n > 1 ? i / (n - 1) : 0, b, i);
    });
  }

  vanish() {
    return this.each((b) => { b.alive = false; });
  }
}
