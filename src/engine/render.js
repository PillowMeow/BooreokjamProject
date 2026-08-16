import { FIELD_W, FIELD_H, LEFT, RIGHT, TOP, BOTTOM, TAU } from './config.js';
import { oklch } from './color.js';

// 결과 화면에 표시할 난이도 항목 (UI 패널과 같은 순서·이름)
const DIFF_KEYS = [
  ['density', '탄밀'],
  ['speed', '탄속'],
  ['special', '특수'],
];

// 최소한의 그리기. 무엇이 어디 있는지 + 탄 모양 구분 + 보스 게이지가 전부다.

const GRID_CELL = 32;
const GRID_COLOR = 'rgba(120, 150, 200, 0.055)';
const GRID_ACCENT = 'rgba(120, 150, 200, 0.1)';

const BOSS_BAR_H = 6;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.bossBarShown = 0;   // 실제 HP를 따라가는 표시값 (튀지 않게 보간)
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(
      window.innerWidth / FIELD_W,
      window.innerHeight / FIELD_H,
    );
    this.scale = Math.max(1, Math.floor(fit * 2) / 2);

    this.canvas.width = Math.round(FIELD_W * this.scale * dpr);
    this.canvas.height = Math.round(FIELD_H * this.scale * dpr);
    this.canvas.style.width = `${FIELD_W * this.scale}px`;
    this.canvas.style.height = `${FIELD_H * this.scale}px`;
    this.dpr = dpr;
  }

  draw(stage) {
    const ctx = this.ctx;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 사망/폭탄 시 화면 흔들림. 프레임 기반이라 재생할 때마다 같은 결과가 나온다.
    let ox = 0;
    let oy = 0;
    if (stage.shake > 0.05) {
      ox = Math.sin(stage.frame * 2.7) * stage.shake;
      oy = Math.cos(stage.frame * 3.9) * stage.shake * 0.8;
    }

    // 월드 좌표(중앙 원점) -> 화면 좌표
    const s = this.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, (-LEFT + ox) * s, (-TOP + oy) * s);

    this.drawGrid(ctx);
    this.drawEnemies(ctx, stage);
    this.drawBullets(ctx, stage);
    this.drawPlayerShots(ctx, stage);
    this.drawPlayer(ctx, stage);

    // 게이지와 결과는 흔들리지 않는다.
    ctx.setTransform(s, 0, 0, s, -LEFT * s, -TOP * s);
    this.drawBossBar(ctx, stage);
    this.drawTitle(ctx, stage);
    this.drawResult(ctx, stage);
  }

  // ── 배경 ──────────────────────────────────────────────────────────

  drawGrid(ctx) {
    ctx.lineWidth = 1;

    ctx.beginPath();
    for (let x = LEFT; x <= RIGHT; x += GRID_CELL) {
      ctx.moveTo(x + 0.5, TOP);
      ctx.lineTo(x + 0.5, BOTTOM);
    }
    for (let y = TOP; y <= BOTTOM; y += GRID_CELL) {
      ctx.moveTo(LEFT, y + 0.5);
      ctx.lineTo(RIGHT, y + 0.5);
    }
    ctx.strokeStyle = GRID_COLOR;
    ctx.stroke();

    // 중앙 십자만 아주 살짝 진하게
    ctx.beginPath();
    ctx.moveTo(0.5, TOP);
    ctx.lineTo(0.5, BOTTOM);
    ctx.moveTo(LEFT, 0.5);
    ctx.lineTo(RIGHT, 0.5);
    ctx.strokeStyle = GRID_ACCENT;
    ctx.stroke();
  }

  // ── 개체 ──────────────────────────────────────────────────────────

  drawEnemies(ctx, stage) {
    for (const e of stage.enemies) {
      if (e.sprite) {
        // 히트박스 = 그려지는 사각형 그대로.
        ctx.drawImage(e.sprite, e.x - e.w / 2, e.y - e.h / 2, e.w, e.h);
        continue;
      }
      ctx.fillStyle = e.color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawBullets(ctx, stage) {
    for (const b of stage.bullets.active) {
      if (!b.alive) continue;
      if (b.delay > 0) { drawTelegraph(ctx, b); continue; }
      switch (b.shape) {
        case 'orb':   drawOrb(ctx, b); break;
        case 'wedge': drawWedge(ctx, b); break;
        case 'rod':   drawRod(ctx, b); break;
        default:      drawCircle(ctx, b); break;
      }
    }
  }

  drawPlayerShots(ctx, stage) {
    ctx.fillStyle = 'rgba(150, 220, 255, 0.75)';
    for (const shot of stage.player.shots) {
      ctx.fillRect(shot.x - 2, shot.y - 8, 4, 16);
    }
  }

  drawPlayer(ctx, stage) {
    const p = stage.player;
    ctx.globalAlpha = p.invulnerable ? 0.4 : 1;

    ctx.fillStyle = '#9fd8ff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, TAU);
    ctx.fill();

    // 판정점
    ctx.fillStyle = p.focus ? '#ffffff' : '#ff3355';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  // ── 보스 게이지 ───────────────────────────────────────────────────

  drawBossBar(ctx, stage) {
    const target = stage.result ? 0 : stage.gauge;

    // 표시값을 목표치로 부드럽게 당긴다. 0이 되면 사라짐.
    this.bossBarShown += (target - this.bossBarShown) * 0.15;
    if (Math.abs(target - this.bossBarShown) < 0.002) this.bossBarShown = target;
    if (this.bossBarShown <= 0) return;

    const survival = stage.mode === 'survival';

    ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.fillRect(LEFT, TOP, FIELD_W, BOSS_BAR_H);

    const w = FIELD_W * this.bossBarShown;
    ctx.fillStyle = survival ? '#1e6fe0' : '#e01e37';
    ctx.fillRect(LEFT, TOP, w, BOSS_BAR_H);

    // 위쪽 1px만 밝게 — 게이지가 납작하게 보이지 않도록
    ctx.fillStyle = survival ? 'rgba(130, 190, 255, 0.9)' : 'rgba(255, 120, 130, 0.9)';
    ctx.fillRect(LEFT, TOP, w, 1);

    // 임계점 표시
    for (const t of stage.thresholds) {
      const x = Math.round(LEFT + FIELD_W * t);
      const passed = this.bossBarShown <= t;
      ctx.fillStyle = passed ? 'rgba(255,255,255,0.25)' : 'rgba(10,12,18,0.85)';
      ctx.fillRect(x - 1, TOP, 2, BOSS_BAR_H);
      ctx.fillStyle = passed ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.75)';
      ctx.fillRect(x - 1, TOP + BOSS_BAR_H, 2, 2);
    }
  }

  /**
   * 스펠 카드 이름.
   *   0 ~ 60프레임   : 화면 중앙 오른쪽에 크게 (처음 12프레임 동안 스르륵 등장)
   *  60 ~ 90프레임   : 작아지면서 오른쪽 위 구석으로 이동
   *  90프레임 ~      : 구석에 그대로
   */
  drawTitle(ctx, stage) {
    const title = stage.title;
    if (!title) return;

    const APPEAR = 60;   // 크게 떠 있는 시간
    const MOVE = 30;     // 올라가며 작아지는 시간

    const big = { x: RIGHT - 24, y: 6, font: 16 };
    const small = { x: RIGHT - 6, y: TOP + BOSS_BAR_H + 13, font: 9 };

    // 0 = 중앙 오른쪽(큼), 1 = 구석(작음)
    let k = 0;
    if (title.age >= APPEAR) {
      const u = Math.min(1, (title.age - APPEAR) / MOVE);
      k = u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u);
    }

    const x = big.x + (small.x - big.x) * k;
    const y = big.y + (small.y - big.y) * k;
    const font = big.font + (small.font - big.font) * k;

    // 등장할 때 살짝 밀려 들어오면서 나타난다
    const inT = Math.min(1, title.age / 12);
    const slide = (1 - inT) * 24;
    const alpha = 0.15 + 0.85 * inT;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = 'right';
    ctx.font = `bold ${font.toFixed(1)}px ui-monospace, Consolas, monospace`;

    // 탄 위에서도 읽히도록 어두운 테두리
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(4, 6, 12, 0.85)';
    ctx.strokeText(title.text, x + slide, y);
    ctx.fillStyle = '#ffe7a8';
    ctx.fillText(title.text, x + slide, y);

    // 큰 상태일 때만 밑줄
    if (k < 1) {
      const w = ctx.measureText(title.text).width;
      ctx.globalAlpha = alpha * (1 - k);
      ctx.fillStyle = 'rgba(255, 231, 168, 0.6)';
      ctx.fillRect(x + slide - w, y + 5, w, 1);
    }

    ctx.restore();
    ctx.textAlign = 'start';
  }

  drawResult(ctx, stage) {
    const r = stage.result;
    if (!r) return;

    const name = stage.pattern?.name ?? '이름 없는 탄막';
    const diff = stage.pattern?.difficulty ?? null;
    const stats = [
      `클리어 시간   ${r.seconds.toFixed(2)}초`,
      `폭탄          ${r.bombs}회`,
      `사망          ${r.deaths}회`,
      `그레이즈      ${(r.grazeRatio * 100).toFixed(1)}%  (${r.graze} / ${r.fired})`,
    ];

    const boxW = 250;
    const diffH = diff ? DIFF_KEYS.length * 13 + 6 : 0;
    const boxH = 62 + diffH + stats.length * 16;
    const x = -boxW / 2;
    const y = -boxH / 2;

    ctx.fillStyle = 'rgba(6, 8, 14, 0.9)';
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = 'rgba(160, 190, 230, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

    ctx.textAlign = 'center';

    // 클리어한 탄막 이름
    ctx.font = 'bold 15px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#ffe7a8';
    ctx.fillText(name, 0, y + 24);

    // 격파 / 생존 성공
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillStyle = stage.mode === 'survival' ? '#8fc2ff' : '#ff9aa8';
    ctx.fillText(stage.mode === 'survival' ? '생존 성공' : '격 파', 0, y + 40);

    // 난이도 막대
    let cursor = y + 52;
    if (diff) {
      ctx.font = '9px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'left';
      for (const [key, label] of DIFF_KEYS) {
        const v = diff[key] ?? 0;
        const bx = x + 76;
        ctx.fillStyle = '#8fa0bb';
        ctx.fillText(label, x + 52, cursor + 7);
        for (let i = 0; i < 10; i++) {
          ctx.fillStyle = i < v ? oklch(0.78, 0.19, 145 - (i / 9) * 145) : 'rgba(140,170,220,0.16)';
          ctx.fillRect(bx + i * 9, cursor, 7, 7);
        }
        ctx.fillStyle = '#dbe6f5';
        ctx.fillText(String(v), bx + 94, cursor + 7);
        cursor += 13;
      }
      ctx.textAlign = 'center';
      cursor += 6;
    }

    // 기록
    ctx.font = '12px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#cfdcef';
    for (const line of stats) {
      ctx.fillText(line, 0, cursor + 12);
      cursor += 16;
    }

    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#7d8ba3';
    ctx.fillText('R = 다시', 0, y + boxH - 8);
    ctx.textAlign = 'start';
  }
}

// ── 탄 모양 ─────────────────────────────────────────────────────────
//
// 배경이 검은색이라 어두운 요소는 그냥 사라져 보인다.
// 그래서 밝은 단색으로 칠하고, 속심은 흰색/검은색이 아니라
// "그 색을 훨씬 밝게 올린 색"으로 넣는다. 색조는 유지되면서 가운데가 뜬다.
// 겹친 탄끼리 구분되도록 아주 얇은 어두운 윤곽선만 두른다.
//
// size의 해석:
//   circle : 반지름
//   orb    : 반지름 (옅은 후광이 붙은 큰 원)
//   wedge  : 길이 size*2.2, 폭 size*1.4 인 삼각형, 진행 방향을 가리킴
//   rod    : 길이 size*3.6, 폭 size*0.5 인 얇은 막대, 진행 방향으로 누움

const RIM = 'rgba(0, 0, 0, 0.55)';
const RIM_WIDTH = 1;

// 속심을 만들 때 흰색 쪽으로 섞는 비율.
const CORE_LIGHTEN = 0.75;

const coreCache = new Map();
const probe = document.createElement('canvas').getContext('2d');

/** 색을 흰색 쪽으로 끌어올린 밝은 버전. 색조는 그대로 남는다. */
function coreOf(color) {
  let core = coreCache.get(color);
  if (core === undefined) {
    const [r, g, b] = toRgb(color);
    core = `rgb(${lighten(r)}, ${lighten(g)}, ${lighten(b)})`;
    coreCache.set(color, core);
  }
  return core;
}

function lighten(v) {
  return Math.round(v + (255 - v) * CORE_LIGHTEN);
}

function toRgb(color) {
  probe.fillStyle = '#000';
  probe.fillStyle = color;          // 브라우저가 '#rrggbb' 또는 'rgb(...)'로 정규화해 준다
  const css = /** @type {string} */ (probe.fillStyle);
  if (css[0] === '#') {
    const n = parseInt(css.slice(1, 7), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const m = css.match(/[\d.]+/g);
  return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
}

/** 등장 지연 중인 탄의 예고 표시. 바깥 원이 조여들면서 실제 크기가 된다. */
function drawTelegraph(ctx, b) {
  const t = b.delayTotal > 0 ? b.delay / b.delayTotal : 0;
  const r = b.size * (1 + 2.2 * t);

  ctx.globalAlpha = 0.35 + 0.35 * (1 - t);
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, TAU);
  ctx.stroke();

  ctx.globalAlpha = 0.5 * (1 - t);
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.size * 0.6, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawCircle(ctx, b) {
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.size, 0, TAU);
  ctx.fillStyle = b.color;
  ctx.fill();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = RIM_WIDTH;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(b.x, b.y, b.size * 0.45, 0, TAU);
  ctx.fillStyle = coreOf(b.color);
  ctx.fill();
}

function drawOrb(ctx, b) {
  const r = b.size;

  ctx.globalAlpha = 0.25;
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r * 1.4, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, TAU);
  ctx.fillStyle = b.color;
  ctx.fill();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = RIM_WIDTH;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(b.x, b.y, r * 0.42, 0, TAU);
  ctx.fillStyle = coreOf(b.color);
  ctx.fill();
}

function drawWedge(ctx, b) {
  const len = b.size * 2.2;
  const half = b.size * 0.7;

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);

  ctx.beginPath();
  ctx.moveTo(len * 0.55, 0);
  ctx.lineTo(-len * 0.45, -half);
  ctx.lineTo(-len * 0.45, half);
  ctx.closePath();
  ctx.fillStyle = b.color;
  ctx.fill();
  ctx.strokeStyle = RIM;
  ctx.lineWidth = RIM_WIDTH;
  ctx.stroke();

  // 같은 삼각형을 작게 줄인 속심
  ctx.beginPath();
  ctx.moveTo(len * 0.24, 0);
  ctx.lineTo(-len * 0.2, -half * 0.44);
  ctx.lineTo(-len * 0.2, half * 0.44);
  ctx.closePath();
  ctx.fillStyle = coreOf(b.color);
  ctx.fill();

  ctx.restore();
}

function drawRod(ctx, b) {
  const len = b.size * 3.6;
  const w = Math.max(1.6, b.size * 0.5);

  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.angle);

  // 그냥 얇은 막대
  ctx.fillStyle = b.color;
  ctx.fillRect(-len / 2, -w / 2, len, w);
  ctx.strokeStyle = RIM;
  ctx.lineWidth = RIM_WIDTH;
  ctx.strokeRect(-len / 2, -w / 2, len, w);

  ctx.fillStyle = coreOf(b.color);
  ctx.fillRect(-len * 0.34, -w * 0.22, len * 0.68, w * 0.44);

  ctx.restore();
}

export { FIELD_W, FIELD_H };
