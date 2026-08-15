// practice.js — 연습용 3페이즈 보스 패턴
//
// src/patterns/ 안에 두거나, UI의 "파일 열기"로 바로 불러도 된다.
// (상대 import가 없어서 두 경로 모두 동작한다)

// ── 색 ────────────────────────────────────────────────
// src/patterns/ 에 둘 거면 이 4줄을 지우고
//   import { C } from '../palette.js';
// 로 바꾸는 게 낫다. 팔레트에 정리된 색만 쓰면 배경에 묻히지 않는다.
const CY = '#7ad7ff'; // 하늘
const YE = '#ffe95c'; // 노랑
const PK = '#ff7ad7'; // 분홍
const GR = '#8affc1'; // 연두

export default {
  name: '연습용 3페이즈',

  clear: 'boss',
  hp: 1800,
  thresholds: [0.66, 0.33], // 게이지가 이 값을 지날 때마다 s.phase 가 1 오른다

  init(s) {
    s.boss.x = 0;
    s.boss.y = -140;
  },

  // main 은 "판 전체의 진행"만 쓴다. 실제 발사는 fork 한 루틴에 맡긴다.
  *main(s) {
    s.fork(bossFloat(s), s.boss); // 보스 이동: 판이 끝날 때까지 계속 돈다

    yield* phase(s, ringAndAim(s)); // 게이지 0.66 까지
    yield* phase(s, spiral(s));     // 게이지 0.33 까지
    yield* phase(s, finale(s));     // 격파할 때까지
  },
};

// 한 페이즈를 돌리고, 임계점을 넘으면 정리하는 공통 틀.
// 이 6줄이 이 엔진의 핵심 관용구다.
function* phase(s, routine) {
  const task = s.fork(routine);
  yield s.untilPhaseChange();
  s.cancel(task);   // 이 루틴이 fork 한 하위 태스크까지 같이 죽는다
  s.clearBullets(); // 화면 청소
  yield 30;         // 숨 돌릴 틈
}

// ── 보스 이동 ─────────────────────────────────────────
function* bossFloat(s) {
  const b = s.boss;
  while (true) {
    // 난수는 반드시 s.rand — Math.random 을 쓰면 시드 재현성이 깨진다
    yield* b.moveTo(s.rand(-110, 110), s.rand(-170, -95), 90);
    yield 40;
  }
}

// ── 페이즈 0: 링 + 조준 ───────────────────────────────
// 배우는 것: fireRing / fireFan / s.aim / 발사 사이의 yield 리듬
function* ringAndAim(s) {
  const b = s.boss;
  while (true) {
    // 사방으로 퍼지는 링 3연발. 매번 각도를 10도씩 어긋나게 해서
    // 앞 링의 틈을 뒷 링이 메운다 → 그냥 3번 쏘는 것보다 훨씬 압박이 있다.
    for (let i = 0; i < 3; i++) {
      s.fireRing({
        x: b.x, y: b.y,
        count: 18,
        angle: s.deg(10) * i,
        speed: 2.2,
        color: CY, size: 3.5, r: 3,
      });
      yield 14;
    }
    yield 34;

    // 플레이어를 노리는 부채꼴 3연발.
    // 고정탄(위)과 조준탄(아래)을 번갈아 내는 게 탄막 설계의 기본이다.
    for (let i = 0; i < 3; i++) {
      s.fireFan({
        x: b.x, y: b.y,
        count: 5,
        angle: s.aim(b),      // b 에서 플레이어를 향하는 각도
        spread: s.deg(26),
        speed: 3.0,
        color: YE, shape: 'wedge', size: 4, r: 2.4,
      });
      yield 10;
    }
    yield 50;
  }
}

// ── 페이즈 1: 나선 ────────────────────────────────────
// 배우는 것: 각도 누적 = 나선. s.every 로 다른 리듬 겹치기. s.phase 로 강화.
function* spiral(s) {
  const b = s.boss;

  // 나선과 별개 주기로 도는 큰 조준탄. 나선만 있으면 화면 가운데가 너무 안전해진다.
  s.every(70, () => {
    s.fire({
      x: b.x, y: b.y,
      angle: s.aim(b),
      speed: 1.2, accel: 0.04, maxSpeed: 4, // 천천히 출발해서 가속
      shape: 'orb', size: 8, r: 6, color: PK,
    });
  });

  let a = 0;
  while (true) {
    const arms = 4 + s.phase * 2; // 페이즈가 오르면 알아서 굵어진다

    // 서로 반대로 도는 두 층 → 격자 모양의 틈이 생겼다 사라진다
    s.fireRing({ x: b.x, y: b.y, count: arms, angle:  a,       speed: 2.6, color: CY, size: 3, r: 2.5 });
    s.fireRing({ x: b.x, y: b.y, count: arms, angle: -a * 1.3, speed: 1.9, color: GR, size: 3, r: 2.5 });

    a += s.deg(7); // ← 나선을 만드는 건 사실상 이 한 줄이다
    yield 3;
  }
}

// ── 페이즈 2: 예약 변경 · 배치 · 그룹 ─────────────────
// 배우는 것: plan / fireLine / motion / group
function* finale(s) {
  const b = s.boss;
  while (true) {
    // (a) 퍼졌다가 멈추고, 다시 플레이어 쪽으로 튀어나가는 탄.
    //     onUpdate 를 안 쓰고 plan 으로 시간표만 적어 두는 방식.
    s.fireRing({
      x: b.x, y: b.y, count: 24, speed: 3.4,
      color: GR, size: 3.2, r: 2.7,
      plan: [
        { at: 40, speed: 0, over: 18 },       // 40프레임째, 18프레임에 걸쳐 정지
        { at: 95, angle: 'aim', speed: 3.6 }, // 95프레임째, 플레이어 쪽으로 재발사
      ],
    });
    yield 130;

    // (b) 천장에서 내려오는 벽. 좌표를 직접 안 세고 fireLine 에 맡긴다.
    s.fireLine({
      from: { x: s.bounds.left + 8, y: s.bounds.top + 16 },
      to:   { x: s.bounds.right - 8, y: s.bounds.top + 16 },
      count: 13,
      facing: s.deg(90), // y 가 아래쪽이 양수 → 90도가 '아래'
      speed: 1.7,
      color: CY, shape: 'rod', size: 4, r: 2,
    });
    yield 80;

    // (c) 보스를 도는 위성탄. 헬퍼로 안 되는 배치는 그냥 직접 계산하면 된다.
    for (let i = 0; i < 6; i++) {
      const th = s.deg(60) * i;
      s.fire({
        x: b.x + Math.cos(th) * 70,
        y: b.y + Math.sin(th) * 70,
        speed: 0,
        motion: { type: 'orbit', center: b, omega: s.deg(1.5) },
        life: 320, // 안 지우면 영원히 남는다
        shape: 'orb', size: 6, r: 4.5, color: PK,
      });
    }
    yield 60;

    // (d) 쏜 다음에 통째로 조작하기.
    const g = s.group(s.fireFan({
      x: b.x, y: b.y, count: 14,
      angle: s.aim(b), spread: s.deg(130),
      speed: 2.0, color: YE, size: 3, r: 2.5,
    }));
    yield 40;
    g.changeAngle(ang => ang + s.deg(70), 40); // 40프레임에 걸쳐 70도 꺾기
    g.colorBy(t => s.rainbow(t));
    yield 90;
  }
}