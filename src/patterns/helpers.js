// 새 헬퍼 확인용 데모. 4구간을 돌면서 배치·거동·색 헬퍼를 하나씩 보여준다.
// (?p=./patterns/helpers.js)

export default {
  name: '헬퍼 데모',
  clear: 'survival',
  seconds: 60,
  thresholds: [0.75, 0.5, 0.25],

  *main(s) {
    const core = s.boss;
    yield* core.moveTo(0, s.bounds.top + core.h / 2 - 10, 60);

    // 구간이 바뀔 때마다 이전 공격을 정리하고 다음으로 넘어간다.
    yield* section(s, polygons(s, core));
    yield* section(s, orbits(s, core));
    yield* section(s, paths(s, core));
    yield* section(s, planned(s, core));
  },
};

function* section(s, routine) {
  const task = s.fork(routine, s.boss);
  yield s.untilPhaseChange();
  s.cancel(task);
  s.clearBullets();
  yield 45;
}

// ── 1. 다각형·별 배치 + 무지개 그라데이션 ─────────────────────────

function* polygons(s, core) {
  let rotation = 0;
  let sides = 3;

  while (true) {
    // 정다각형 윤곽으로 배치하고, 바깥을 향해 천천히 퍼진다.
    s.firePolygon({
      sides, radius: 70, perSide: 6,
      center: { x: core.x, y: core.y + 40 },
      rotation,
      facing: 'out',
      speed: 1.5,
      size: 3.5, r: 3,
      ramp: { color: [s.oklch(0.8, 0.2, 20), s.oklch(0.8, 0.2, 200)] },
    });

    rotation += s.deg(9);
    sides = 3 + ((sides - 2) % 4);
    yield 40;

    // 별 배치. 색은 위치에 따라 무지개 한 바퀴.
    const g = s.group(s.fireStar({
      points: 5, inner: 26, outer: 62, perEdge: 4,
      center: { x: core.x, y: core.y + 40 },
      rotation: -rotation,
      facing: 'out',
      speed: 1.2, size: 3, r: 2.5,
    }));
    g.colorBy((t) => s.rainbow(t));

    yield 40;
  }
}

// ── 2. 한 점을 도는 공전 + 회전하는 발사대 ────────────────────────

function* orbits(s, core) {
  const center = { x: 0, y: -40 };
  let a = 0;

  // 링을 통째로 공전시킨다. 반지름이 서서히 커진다.
  s.every(24, () => {
    s.fireRing({
      count: 10, radius: 40, center,
      facing: 'out', speed: 0,
      motion: { type: 'orbit', center, omega: s.deg(1.6), radiusSpeed: 0.55 },
      size: 3, r: 2.5,
      ramp: { color: [s.hsv(280, 0.7, 1), s.hsv(190, 0.7, 1)] },
    });
  });

  // 회전하는 팔 끝에서 조준탄
  while (true) {
    a += s.deg(23);
    const tip = s.polar(a, 90, { x: core.x, y: core.y + 30 });
    s.fireFan({
      count: 3, origin: tip, angle: 0, spread: s.deg(18),
      aimType: 'aim',
      speed: 2.6, shape: 'wedge', size: 4, r: 2.5,
      color: s.oklch(0.85, 0.17, 90),
    });
    yield 10;
  }
}

// ── 3. 경로를 따라 움직이는 탄 ────────────────────────────────────

function* paths(s, core) {
  const center = { x: 0, y: 0 };

  while (true) {
    // 다각형 궤도를 그리며 도는 탄
    const tri = s.pathPolygon(3, 110, { center, rotation: s.rand(0, s.TAU) });
    s.firePath(tri, {
      count: 12, closed: true,
      facing: 'along', speed: 0,
      motion: { type: 'path', path: tri, frames: 240, loop: true },
      size: 3.5, r: 3,
      ramp: { color: [s.oklch(0.85, 0.18, 150), s.oklch(0.75, 0.2, 300)] },
    });
    yield 90;

    // 리사주 곡선을 따라 흐르다가 끝나면 접선 방향으로 빠져나간다
    const liss = s.pathLissajous(3, 2, { center, width: 150, height: 110 });
    s.firePath(liss, {
      count: 24, closed: true,
      facing: 'along',
      speed: 2,
      motion: { type: 'path', path: liss, frames: 300, loop: false },
      size: 3, r: 2.5,
      ramp: { color: (t) => s.rainbow(t) },
    });
    yield 120;

    // 사인 파동으로 내려오는 탄
    s.fireLine({
      from: { x: s.bounds.left + 20, y: s.bounds.top + 10 },
      to: { x: s.bounds.right - 20, y: s.bounds.top + 10 },
      count: 9,
      angle: s.deg(90),
      speed: 1.6,
      motion: { type: 'wave', amp: 16, period: 50 },
      size: 3, r: 2.5,
      color: s.oklch(0.85, 0.15, 200),
    });
    yield 90;
  }
}

// ── 4. 예약 변경 + 등장 지연 + 그룹 조작 ──────────────────────────

function* planned(s, core) {
  while (true) {
    // 예고 표시 후 등장 -> 잠깐 멈췄다가 -> 플레이어를 향해 재발사
    s.fireRing({
      count: 20, radius: 20,
      center: { x: core.x, y: core.y + 30 },
      facing: 'out',
      speed: 2.4,
      delay: 24,
      size: 3.5, r: 3,
      color: s.oklch(0.8, 0.2, 30),
      plan: [
        { at: 70, speed: 0, over: 20 },
        { at: 110, angle: 'aim', speed: 3.4, over: 12, ease: 'out' },
      ],
    });
    yield 70;

    // 그룹으로 나중에 한꺼번에 꺾기
    const g = s.group(s.fireFan({
      count: 12, angle: s.deg(90), spread: s.deg(70),
      x: core.x, y: core.y + 30,
      speed: 2.2, shape: 'rod', size: 5, r: 2.5,
      ramp: { color: [s.oklch(0.85, 0.2, 60), s.oklch(0.8, 0.2, 330)] },
    }));
    yield 45;
    g.changeAngle((a) => a + s.deg(60) * s.randSign(), 30, 'inOut');
    g.changeSpeed(3.4, 30);

    yield 60;
  }
}
