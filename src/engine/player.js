import { LEFT, RIGHT, TOP, BOTTOM } from './config.js';

const NORMAL_SPEED = 3.6;
const FOCUS_SPEED = 1.6;
const HIT_RADIUS = 2.5;
const GRAZE_RADIUS = 18;
const INVULN_FRAMES = 120;   // 피격 후 무적
const BOMB_INVULN = 60;      // 폭탄 무적 = 1초
const SHOT_INTERVAL = 4;
const SHOT_SPEED = 12;
const SHOT_DAMAGE = 2;

export class Player {
  constructor() {
    this.x = 0;
    this.y = BOTTOM - 80;
    this.r = HIT_RADIUS;
    this.alive = true;
    this.focus = false;
    this.invuln = 0;
    this.shotCooldown = 0;
    this.deaths = 0;
    this.graze = 0;
    this.shots = [];
  }

  reset() {
    this.x = 0;
    this.y = BOTTOM - 80;
    this.invuln = INVULN_FRAMES;
    this.shotCooldown = 0;
    this.shots.length = 0;
  }

  get invulnerable() {
    return this.invuln > 0;
  }

  /** 이미 걸린 무적이 더 길면 그대로 둔다. */
  grantInvuln(frames) {
    this.invuln = Math.max(this.invuln, frames);
  }

  update(input) {
    if (this.invuln > 0) this.invuln--;

    this.focus = input.focus;
    const speed = this.focus ? FOCUS_SPEED : NORMAL_SPEED;

    let dx = 0;
    let dy = 0;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (dx !== 0 && dy !== 0) {
      const inv = Math.SQRT1_2;
      dx *= inv;
      dy *= inv;
    }

    this.x = clamp(this.x + dx * speed, LEFT + 8, RIGHT - 8);
    this.y = clamp(this.y + dy * speed, TOP + 8, BOTTOM - 8);

    this.updateShots(input);
  }

  updateShots(input) {
    if (this.shotCooldown > 0) this.shotCooldown--;
    if (input.shoot && this.shotCooldown === 0) {
      this.shotCooldown = SHOT_INTERVAL;
      const offset = this.focus ? 5 : 11;
      this.shots.push(makeShot(this.x - offset, this.y - 10));
      this.shots.push(makeShot(this.x + offset, this.y - 10));
    }

    const shots = this.shots;
    let n = 0;
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      s.y -= SHOT_SPEED;
      if (s.alive && s.y > TOP - 16) shots[n++] = s;
    }
    shots.length = n;
  }

  // 피격 처리. 무적 중이면 무시하고 false를 돌려준다.
  hit() {
    if (this.invuln > 0) return false;
    this.deaths++;
    this.reset();
    return true;
  }
}

function makeShot(x, y) {
  return { x, y, r: 4, damage: SHOT_DAMAGE, alive: true };
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export { GRAZE_RADIUS, BOMB_INVULN };
