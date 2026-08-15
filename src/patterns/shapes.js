// 탄 모양 4종 확인용. (?p=./patterns/shapes.js)
//
//   circle : 기본 동그란 탄       size = 반지름
//   orb    : 커다란 동그라미       size = 반지름 (테두리 + 속심)
//   wedge  : 쐐기, 진행 방향을 향함  size = 대략 절반 길이
//   rod    : 뾰족한 막대            size = 대략 1/3.6 길이

// 색은 s.C(팔레트)로 받는다. import를 쓰지 않으므로 이 파일 하나만 건네주면 그대로 돌아간다.
const showcase = (s) => [
  { shape: 'circle', size: 3.5, r: 3,   speed: 1.8, count: 18, color: s.C.magenta },
  { shape: 'orb',    size: 9,   r: 7,   speed: 1.2, count: 8,  color: s.C.violet },
  { shape: 'wedge',  size: 5,   r: 3,   speed: 2.6, count: 14, color: s.C.cyan },
  { shape: 'rod',    size: 6,   r: 2.5, speed: 2.2, count: 12, color: s.C.yellow },
];

export default {
  name: '탄 모양 전시',
  clear: 'boss',
  hp: 4000,
  thresholds: [0.5],
  difficulty: { density: 3, speed: 3, special: 1 },

  *main(s) {
    const core = s.boss;
    const list = showcase(s);
    let angle = 0;
    let i = 0;

    while (core.alive) {
      const { count, ...bullet } = list[i % list.length];
      i++;

      // 같은 모양으로 세 번 연사하면서 조금씩 각을 돌린다.
      for (let k = 0; k < 3; k++) {
        s.fireRing({ ...bullet, count, angle, x: core.x, y: core.y });
        angle += s.deg(9);
        yield 18;
      }

      // 모양이 바뀌기 전에 조준탄 한 발
      s.fire({
        ...bullet,
        angle: s.aim(core),
        speed: bullet.speed + 1.4,
        x: core.x,
        y: core.y,
        color: s.C.white,
      });

      yield 60;
    }
  },
};
