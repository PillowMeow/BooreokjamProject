// 시드 고정 난수. 같은 시드 + 같은 입력이면 항상 같은 탄막이 나오도록 Math.random을 쓰지 않는다.
// mulberry32.

export class Rng {
  constructor(seed = 0x9e3779b9) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  reset(seed = this.seed) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  // [0, 1)
  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // [min, max)
  range(min, max) {
    return min + this.next() * (max - min);
  }

  // [min, max] 정수
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
}
