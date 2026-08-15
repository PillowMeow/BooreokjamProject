import { TAU, LEFT, RIGHT, TOP, BOTTOM } from './config.js';
import { angleDiff, approachAngle, ease, pathTangent, lerp } from './mathx.js';

// 탄의 시간에 따른 거동. 세 가지 장치가 있다.
//
//   motion : 매 프레임 도는 거동 모듈 (wave / orbit / homing / path / bounce)
//   plan   : "N프레임 뒤에 이 값으로 바꿔라" 예약 목록
//   tween  : 값 하나를 여러 프레임에 걸쳐 보간 (plan의 over, group.changeSpeed 등이 만든다)
//
// 모듈은 파라미터 객체만 갖고 실행 함수는 타입별로 하나씩 공유한다.
// (탄마다 클로저를 만들면 풀링 이점이 사라진다)

// 보간 가능한 숫자 필드
const TWEENABLE = new Set(['speed', 'angle', 'omega', 'accel', 'size', 'r']);

// ── motion ──────────────────────────────────────────────────────────

function resolvePoint(p, st) {
  if (!p) return { x: 0, y: 0 };
  if (p === 'player') return st.player;
  if (p === 'boss') return st.boss ?? { x: 0, y: 0 };
  return p;
}

const MOTIONS = {
  /** 진행 방향 기준 좌우 사인 흔들림 */
  wave: {
    step(b, st, m) {
      const period = m.period || 40;
      const amp = m.amp ?? 20;
      const k = TAU / period;
      const phase = m.phase ?? 0;
      // 이번 프레임의 가로 변위 증분
      const d = amp * k * Math.cos(k * b.age + phase);
      b.x += Math.cos(b.angle + Math.PI / 2) * d;
      b.y += Math.sin(b.angle + Math.PI / 2) * d;
    },
  },

  /** 한 점 주위를 도는 공전. 위치를 직접 잡는다. */
  orbit: {
    owns: true,
    init(b, st, m) {
      const c = resolvePoint(m.center, st);
      b.ms.theta = Math.atan2(b.y - c.y, b.x - c.x);
      b.ms.radius = m.radius ?? Math.hypot(b.x - c.x, b.y - c.y);
    },
    step(b, st, m) {
      const c = resolvePoint(m.center, st);
      b.ms.theta += m.omega ?? 0.02;
      b.ms.radius += m.radiusSpeed ?? 0;
      if (b.ms.radius < 0) b.ms.radius = 0;
      b.x = c.x + Math.cos(b.ms.theta) * b.ms.radius;
      b.y = c.y + Math.sin(b.ms.theta) * b.ms.radius;
      // 그리기용 방향은 접선
      b.angle = b.ms.theta + Math.sign(m.omega ?? 1) * (Math.PI / 2);
    },
  },

  /** 플레이어를 향해 조금씩 방향을 튼다 */
  homing: {
    step(b, st, m) {
      const frames = m.frames ?? 120;
      if (b.age > frames) return;
      const target = resolvePoint(m.target ?? 'player', st);
      const want = Math.atan2(target.y - b.y, target.x - b.x);
      b.angle = approachAngle(b.angle, want, m.turn ?? 0.02);
    },
  },

  /** 경로를 따라 이동. 위치를 직접 잡는다. */
  path: {
    owns: true,
    init(b, st, m) {
      b.ms.ox = m.origin ? m.origin.x : m.relative ? b.x : 0;
      b.ms.oy = m.origin ? m.origin.y : m.relative ? b.y : 0;
    },
    step(b, st, m) {
      const frames = m.frames || 120;
      let t = b.age / frames;

      if (t >= 1) {
        if (m.loop) {
          t %= 1;
        } else {
          // 경로가 끝나면 마지막 접선 방향으로 자유 비행 (after: 'vanish'면 소멸)
          if (m.after === 'vanish') { b.alive = false; return; }
          b.angle = pathTangent(m.path, 1) + (m.spin ?? 0);
          b.motion = null;
          return;
        }
      }

      const e = m.ease ? ease[m.ease] ?? ease.linear : ease.linear;
      const p = m.path(e(t));
      b.x = b.ms.ox + p.x;
      b.y = b.ms.oy + p.y;
      b.angle = pathTangent(m.path, t);
    },
  },

  /** 벽에서 튕긴다. times번 튕기고 나면 그대로 나간다. */
  bounce: {
    init(b) {
      b.ms.left = 0;
    },
    step(b, st, m) {
      const times = m.times ?? 1;
      if (b.ms.left >= times) return;
      const pad = m.padding ?? 0;
      const cos = Math.cos(b.angle);
      const sin = Math.sin(b.angle);
      let hit = false;

      if ((b.x <= LEFT + pad && cos < 0) || (b.x >= RIGHT - pad && cos > 0)) {
        b.angle = Math.PI - b.angle;
        hit = true;
      } else if ((b.y <= TOP + pad && sin < 0) || (m.floor && b.y >= BOTTOM - pad && sin > 0)) {
        b.angle = -b.angle;
        hit = true;
      }
      if (hit) b.ms.left++;
    },
  },
};

/** 위치를 모듈이 직접 잡는 종류인지 */
export function motionOwnsPosition(motion) {
  const def = motion && MOTIONS[motion.type];
  return !!(def && def.owns);
}

export function stepMotion(b, st) {
  const m = b.motion;
  const def = MOTIONS[m.type];
  if (!def) return;
  if (b.ms === null) {
    b.ms = {};
    if (def.init) def.init(b, st, m);
  }
  def.step(b, st, m);
}

// ── tween ───────────────────────────────────────────────────────────

export function addTween(b, key, to, frames, easeName = 'inOut') {
  if (!TWEENABLE.has(key)) {
    b[key] = to;
    return;
  }
  if (!frames || frames <= 0) {
    b[key] = to;
    return;
  }
  if (b.tw === null) b.tw = [];
  // 같은 필드에 걸린 이전 보간은 버린다
  for (let i = b.tw.length - 1; i >= 0; i--) if (b.tw[i].key === key) b.tw.splice(i, 1);

  const from = b[key];
  b.tw.push({
    key,
    from,
    to: key === 'angle' ? from + angleDiff(from, to) : to,   // 각도는 최단 경로로
    t: 0,
    frames,
    ease: ease[easeName] ?? ease.linear,
  });
}

export function applyTweens(b) {
  const list = b.tw;
  if (list === null) return;
  for (let i = list.length - 1; i >= 0; i--) {
    const tw = list[i];
    tw.t++;
    const k = tw.ease(Math.min(1, tw.t / tw.frames));
    b[tw.key] = lerp(tw.from, tw.to, k);
    if (tw.t >= tw.frames) list.splice(i, 1);
  }
  if (list.length === 0) b.tw = null;
}

// ── plan ────────────────────────────────────────────────────────────

/**
 * step 예시: { at: 60, speed: 0 }, { at: 90, angle: 'aim', speed: 3, over: 20 }
 * - at: 탄의 나이(프레임)
 * - over: 주면 그 프레임 동안 보간, 없으면 즉시
 * - 값으로 'aim'(플레이어 방향) 또는 (bullet, stage) => 값 을 줄 수 있다
 * - vanish: true 면 그 시점에 소멸
 */
export function applyPlan(b, st) {
  const plan = b.plan;
  if (plan === null) return;
  while (b.pi < plan.length && b.age >= plan[b.pi].at) {
    applyStep(b, plan[b.pi], st);
    b.pi++;
  }
}

function applyStep(b, step, st) {
  if (step.vanish) {
    b.alive = false;
    return;
  }
  const over = step.over ?? 0;
  for (const key in step) {
    if (key === 'at' || key === 'over' || key === 'vanish' || key === 'ease') continue;
    let v = step[key];
    if (v === 'aim') v = st.aim(b);
    else if (typeof v === 'function') v = v(b, st);

    if (over > 0 && TWEENABLE.has(key)) addTween(b, key, v, over, step.ease);
    else if (key === 'motion') { b.motion = v; b.ms = null; }
    else b[key] = v;
  }
}
