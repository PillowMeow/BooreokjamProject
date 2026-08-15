// 3단계 보스 탄막 샘플.
//
// 패턴 파일의 형식:
//   export default {
//     name: '이름',
//     clear: 'boss' | 'survival',  // 격파형 / 버티기형
//     hp: 1800,                    // clear: 'boss' 일 때 보스 체력
//     seconds: 45,                 // clear: 'survival' 일 때 버틸 시간
//     thresholds: [0.66, 0.33],    // 임계점. 넘을 때마다 s.phase가 1 오르고 보스바에 표시된다.
//     sprite: './sprites/boss.png',// 선택. 히트박스는 이 이미지 크기 그대로.
//     init(s) {},                  // 선택. 시작 전 1회.
//     *main(s) {},                 // 필수. 제너레이터.
//   }
//
// 보스는 엔진이 만들어 준다 (s.boss). yield 규칙:
//   yield                    -> 1프레임
//   yield 30                 -> 30프레임 (s.wait(30)과 동일)
//   yield s.until(f)         -> f()가 참이 될 때까지
//   yield s.untilPhaseChange() -> 다음 임계점을 넘을 때까지
//   yield* gen()             -> 다른 제너레이터에 위임

export default {
  name: '샘플 보스',
  clear: 'boss',
  hp: 1800,
  thresholds: [0.66, 0.33],
  difficulty: { density: 5, speed: 4, special: 4 },

  *main(s) {
    const boss = s.boss;
    const restY = s.bounds.top + boss.h / 2 - 10;

    yield* boss.moveTo(0, restY, 90);

    yield* phase(s, ringBurst(s, boss));
    yield* phase(s, spiralArms(s, boss));
    yield* phase(s, aimedRain(s, boss));
  },
};

/**
 * 공격 루틴 하나를 돌리다가 임계점을 넘으면 정리하고 다음으로 넘어간다.
 * (마지막 구간이면 보스가 죽을 때까지 돈다)
 */
function* phase(s, routine) {
  const task = s.fork(routine, s.boss);

  yield s.untilPhaseChange();

  s.cancel(task);
  s.clearBullets();
  if (s.result) return;
  yield 60; // 페이즈 사이 숨 돌리는 시간
}

// ── 1페이즈: 좌우로 흔들리면서 링 + 쐐기 조준탄 ────────────────────

function* ringBurst(s, boss) {
  s.fork(sway(s, boss, 90, 180), boss);

  let offset = 0;
  while (true) {
    s.fireRing({
      count: 24,
      angle: offset,
      x: boss.x,
      y: boss.y,
      speed: 1.9,
      size: 3.5,
      r: 2.5,
      color: s.C.magenta,
    });
    offset += s.deg(7.5);

    yield 24;

    s.fireFan({
      count: 5,
      angle: s.aim(boss),
      spread: s.deg(24),
      x: boss.x,
      y: boss.y,
      speed: 3.2,
      shape: 'wedge',
      size: 4,
      r: 2.5,
      color: s.C.cyan,
    });

    yield 24;
  }
}

// ── 2페이즈: 회전하는 나선 3줄 + 커다란 구슬 ──────────────────────

function* spiralArms(s, boss) {
  s.fork(boss.moveTo(0, s.bounds.top + boss.h / 2 + 10, 60), boss);
  s.fork(bigOrbs(s, boss), boss);

  const arms = 3;
  let angle = 0;
  let dir = 1;
  let frame = 0;

  while (true) {
    for (let i = 0; i < arms; i++) {
      s.fire({
        x: boss.x,
        y: boss.y,
        angle: angle + (s.TAU * i) / arms,
        speed: 2.6,
        accel: -0.012,
        minSpeed: 1.1,
        size: 3,
        r: 2.5,
        color: s.C.violet,
      });
    }

    angle += s.deg(11) * dir;
    frame++;
    // 240프레임마다 회전 방향을 뒤집는다.
    if (frame % 240 === 0) dir *= -1;

    yield 3;
  }
}

/** 나선 사이를 가르는 커다란 구슬. 폭탄으로도 안 지워진다. */
function* bigOrbs(s, boss) {
  while (true) {
    yield 150;
    s.fireFan({
      count: 3,
      angle: s.aim(boss),
      spread: s.deg(50),
      x: boss.x,
      y: boss.y,
      speed: 1.5,
      shape: 'orb',
      size: 9,
      r: 7,
      bombProof: true,
      color: s.C.blue,
    });
  }
}

// ── 3페이즈: 뾰족한 막대 산탄 + 위에서 떨어지는 비 ─────────────────

function* aimedRain(s, boss) {
  s.fork(rain(s), boss);
  s.fork(sway(s, boss, 110, 120), boss);

  while (true) {
    const base = s.aim(boss);
    for (let i = 0; i < 3; i++) {
      s.fireFan({
        count: 7,
        angle: base,
        spread: s.deg(40),
        x: boss.x,
        y: boss.y,
        speed: 2.2 + i * 0.5,
        shape: 'rod',
        size: 5,
        r: 2.5,
        color: s.C.orange,
      });
      yield 6;
    }
    yield 70;
  }
}

function* rain(s) {
  const { left, right, top } = s.bounds;
  while (true) {
    s.fire({
      x: s.rand(left + 10, right - 10),
      y: top - 10,
      angle: s.deg(90) + s.rand(-0.25, 0.25),
      speed: s.rand(1.4, 2.4),
      size: 2.5,
      r: 2,
      color: s.C.green,
    });
    yield 4;
  }
}

// ── 공용 움직임 ───────────────────────────────────────────────────

/** amplitude만큼 좌우로 왕복. period는 한 번 왕복하는 데 걸리는 프레임. */
function* sway(s, boss, amplitude, period) {
  const baseX = boss.x;
  const baseY = boss.y;
  let t = 0;
  while (true) {
    t++;
    boss.x = baseX + Math.sin((t / period) * s.TAU) * amplitude;
    boss.y = baseY + Math.sin((t / period) * s.TAU * 2) * 8;
    yield;
  }
}
