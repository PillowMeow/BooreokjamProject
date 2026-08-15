import { DT, MAX_CATCHUP_STEPS } from './config.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { Stage } from './stage.js';

/**
 * 고정 타임스텝(60fps) 루프.
 * 렌더링 프레임레이트와 무관하게 시뮬레이션 스텝 수는 항상 초당 60회다.
 */
export class Engine {
  constructor(canvas, pattern, { seed = 12345 } = {}) {
    this.pattern = pattern;
    this.seed = seed;
    this.input = new Input();
    this.renderer = new Renderer(canvas);
    this.stage = null;
    this.paused = false;
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;

    this.restart();
  }

  /** 다른 탄막으로 갈아끼운다. */
  setPattern(pattern) {
    this.pattern = pattern;
    this.paused = false;
    this.restart();
  }

  restart() {
    this.stage = new Stage(this.pattern, this.seed);
    this.stage.start();
    this.accumulator = 0;
    console.log(`[danmaku] "${this.pattern.name ?? '(무제)'}" 시작`);
  }

  run() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const frame = (now) => {
      this.tick(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  tick(now) {
    const elapsed = Math.min((now - this.lastTime) / 1000, DT * MAX_CATCHUP_STEPS);
    this.lastTime = now;
    this.accumulator += elapsed;

    while (this.accumulator >= DT) {
      this.accumulator -= DT;
      this.step();
    }

    this.renderer.draw(this.stage);
  }

  step() {
    this.input.beginFrame();

    if (this.input.pressed('restart')) this.restart();
    if (this.input.pressed('pause')) this.paused = !this.paused;
    if (this.paused) return;

    const stage = this.stage;
    const wasFinished = stage.finished;
    stage.update(this.input);

    if (stage.finished && !wasFinished) {
      const r = stage.result;
      console.log(
        `[danmaku] 클리어 — ${r.seconds.toFixed(2)}초, 폭탄 ${r.bombs}, 사망 ${r.deaths}, ` +
        `그레이즈 ${(r.grazeRatio * 100).toFixed(1)}% (${r.graze}/${r.fired})`,
      );
    }

    this.updateTitle();
  }

  updateTitle() {
    if (this.stage.frame % 15 !== 0) return;
    const s = this.stage;
    document.title =
      `${this.pattern.name ?? 'danmaku'} | f=${s.frame} bullets=${s.bulletCount} ` +
      `bombs=${s.stats.bombs} deaths=${s.player.deaths} graze=${s.player.graze}` +
      `${this.paused ? ' [PAUSED]' : ''}`;
  }
}
