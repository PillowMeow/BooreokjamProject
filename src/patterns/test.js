// practice.js — 연습용 3페이즈 보스 패턴
//
// import가 없어서 src/patterns/ 에 넣어도 되고 "파일 열기"로 바로 열어도 된다.
// 색은 s.C 로 팔레트를 그대로 쓴다 (docs §2).

export default {
  name: '연습용 3페이즈',

  clear: 'boss',
  hp: 1800,                 // 플레이어 화력이 초당 60이니 이론상 30초, 실제론 더 걸린다
  thresholds: [0.66, 0.33], // 게이지가 이 아래로 내려갈 때마다 s.phase 가 1 오른다

  // main 은 "판의 진행 순서"만 쓴다. 실제 발사는 fork 한 루틴이 한다.
  *main(s) {
    const boss = s.boss;

    yield* boss.moveTo(0, s.bounds.top + 84, 90); // 등장 (= y -140)
    s.fork(bossFloat(s, boss), boss);             // 이동은 판 끝까지 계속

    yield* phase(s, ringAndAim(s, boss)); // 게이지 0.66 까지
    yield* phase(s, spiral(s, boss));     // 게이지 0.33 까지
    yield* phase(s, finale(s, boss));     // 격파할 때까지
  },
};

// 이 엔진의 핵심 관용구. 페이즈 전환을 손으로 쓰면 반드시 뭔가 빠뜨린다.
function* phase(s, routine) {
  const task = s.fork(routine, s.boss);
  yield s.untilPhaseChange(); // 클리어되면 이것도 즉시 풀린다
  s.cancel(task);             // 하위 태스크(every·burst 등)까지 같이 죽는다
  s.clearBullets();
  if (s.result) return;       // 이미 클리어 → 뒷정리 없이 종료
  yield 60;                   // 페이즈 사이 여유
}

// ── 보스 이동 ─────────────────────────────────────────
function* bossFloat(s, boss) {
  while (true) {
    // 난수는 반드시 s.rand — Math.random 은 재시작 재현성을 깬다
    yield* boss.moveTo(s.rand(-110, 110), s.rand(-170, -95), 90);
    yield 40;
  }
}

// ── 페이즈 0: 링 + 조준 ───────────────────────────────
// 배우는 것: origin / radius / ramp / s.aim, 그리고 고정탄·조준탄 교대
function* ringAndAim(s, boss) {
  while (true) {
    // 링 3연발. 매번 10도씩 어긋내서 앞 링의 틈을 뒷 링이 메운다.
    // 그냥 세 번 쏘면 틈이 세 줄 그대로라 서서 피할 수 있다.
    for (let i = 0; i < 3; i++) {
      s.fireRing({
        origin: boss,     // x,y 대신 객체를 그대로 준다
        radius: 24,       // 보스 몸통 바깥에서 나간다
        count: 18,
        angle: s.deg(10) * i,
        speed: 2.2,
        color: s.C.cyan, size: 3.5, r: 3,
      });
      yield 14;
    }
    yield 34;

    // 조준 부채꼴. ramp 로 한쪽 끝을 빠르게 해서 휜 벽처럼 만든다.
    for (let i = 0; i < 3; i++) {
      s.fireFan({
        origin: boss,
        count: 7,
        angle: s.aim(boss),
        spread: s.deg(50),
        ramp: { speed: [2.4, 3.6] }, // i에 따라 2.4 → 3.6 배분
        color: s.C.yellow, shape: 'wedge', size: 4, r: 2.4,
      });
      yield 12;
    }
    yield 50;
  }
}

// ── 페이즈 1: 나선 ────────────────────────────────────
// 배우는 것: 각도 누적 = 나선. s.every 로 다른 주기 겹치기. s.phase 로 강화.
function* spiral(s, boss) {
  // 나선과 어긋난 주기로 도는 큰 조준탄.
  // 나선만 있으면 중심 근처가 너무 안전해진다. (이 태스크는 spiral 의 자식이라
  // phase() 의 cancel 로 같이 죽는다)
  s.every(70, () => {
    s.fire({
      x: boss.x, y: boss.y,
      angle: s.aim(boss),
      speed: 1.2, accel: 0.04, maxSpeed: 4, // 느리게 출발해 가속
      shape: 'orb', size: 8, r: 6, color: s.C.pink,
    });
  });

  let a = 0;
  while (true) {
    const arms = 4 + s.phase * 2; // 임계점을 넘으면 알아서 굵어진다

    // 서로 반대로 도는 두 층 → 격자 틈이 생겼다 사라진다
    s.fireRing({ origin: boss, count: arms, angle: a, speed: 2.6,
                 color: s.C.cyan, size: 3, r: 2.5 });
    s.fireRing({ origin: boss, count: arms, angle: -a * 1.3, speed: 1.9,
                 omega: s.deg(0.3), color: s.C.lime, size: 3, r: 2.5 });

    // 증가량이 TAU/count 의 약수에 가까우면 정지 무늬, 어긋나면 도는 무늬가 된다.
    a += s.deg(7);
    yield 4;   // ← 밀도 조절 손잡이. 3으로 낮추면 확 빽빽해진다
  }
}

// ── 페이즈 2: 예약 변경 · 경로 · 그룹 ─────────────────
// 배우는 것: delay + plan / path 를 배치와 이동에 같이 쓰기 / group
function* finale(s, boss) {
  // 같은 path 객체를 배치(firePath)와 이동(motion)에 재사용한다
  const tri = s.pathPolygon(3, 110, { center: { x: 0, y: -40 } });

  while (true) {
    // (a) 퍼졌다 멈추고, 재조준해서 다시 나가는 탄.
    //     onUpdate 없이 시간표(plan)만 적는다. at 은 탄의 나이(age) 기준.
    s.fireRing({
      origin: boss, radius: 20, count: 24,
      facing: 'out', speed: 3.4,
      delay: 20,                       // 20프레임 예고 — 그동안 판정 없음
      color: s.C.green, size: 3.2, r: 2.7,
      plan: [
        { at: 70,  speed: 0, over: 20 },                              // 서서히 정지
        { at: 115, angle: 'aim', speed: 3.6, over: 12, ease: 'out' }, // 재조준 후 발사
      ],
    });
    yield 150;

    // (b) 삼각 궤도를 도는 위성탄 + 동시에 위에서 내리는 비.
    //     궤도탄은 회전 대칭인 orb 로 — rod/wedge 는 path 이동 중 방향이 안 맞을 수 있다.
    s.firePath(tri, {
      count: 15, speed: 0,
      motion: { type: 'path', path: tri, frames: 300, loop: true },
      life: 300,
      bombProof: true,   // "이건 반드시 피해라" 신호. 남발하면 폭탄이 의미를 잃는다
      color: s.C.violet, shape: 'orb', size: 5, r: 3,
    });

    const rain = s.every(5, () => {
      s.fire({
        x: s.rand(s.bounds.left + 10, s.bounds.right - 10),
        y: s.bounds.top - 10,                    // 컬링 여유(48px) 안쪽에서 만든다
        angle: s.deg(90) + s.rand(-0.2, 0.2),    // y는 아래가 양수 → 90도가 아래
        speed: s.rand(1.4, 2.4),
        color: s.C.blue, size: 2.5, r: 2,
      });
    });
    yield 260;
    s.cancel(rain);
    yield 40;

    // (c) 쏜 다음에 통째로 조작하기
    const g = s.group(s.fireFan({
      origin: boss, count: 14,
      angle: s.aim(boss), spread: s.deg(130),
      speed: 2.0, color: s.C.orange, size: 3, r: 2.5,
    }));
    yield 40;
    g.changeAngle(ang => ang + s.deg(70), 40, 'inOut'); // 40프레임에 걸쳐 꺾기
    g.colorBy(t => s.rainbow(t));
    yield 90;
  }
}