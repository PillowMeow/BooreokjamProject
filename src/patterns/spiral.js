// 버티기형 패턴 예시. 보스는 무적이고, 40초를 버티면 클리어된다.
// clear: 'survival' 이면 보스바가 파란색으로 시간을 센다. (?p=./patterns/spiral.js)

export default {
  name: '나선 연습',
  clear: 'survival',
  seconds: 40,
  difficulty: { density: 6, speed: 5, special: 2 },
  thresholds: [0.66, 0.33],   // 남은 시간 비율 기준

  *main(s) {
    const core = s.boss;
    yield* core.moveTo(0, s.bounds.top + core.h / 2 - 20, 60);

    let angle = 0;

    while (true) {
      // 임계점을 넘을 때마다 줄기가 하나씩 늘어난다.
      const arms = 5 + s.phase * 2;

      s.fireRing({
        count: arms,
        angle,
        x: core.x,
        y: core.y,
        speed: 2.4,
        omega: s.deg(0.35),   // 탄 자체가 서서히 휜다
        shape: 'wedge',
        size: 4,
        r: 2.5,
        color: s.C.pink,
      });

      angle += s.deg(13);
      yield 4;
    }
  },
};
