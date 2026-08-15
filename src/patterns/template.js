// @ts-check
// ↑ 이 한 줄이 있으면 VS Code 가 오타·잘못된 인자를 빨간 줄로 표시해 준다.
//   (실행에는 아무 영향 없다. 거슬리면 지워도 된다)

// ┌──────────────────────────────────────────────────────────────┐
// │ 새 탄막을 만들 때 이 파일을 복사해서 시작하면 된다.            │
// │ 필요한 건 전부 s(스테이지)에 붙어 있다. import 할 것은 없다.  │
// │ 자세한 건 docs/cheatsheet.md 한 장이면 충분하다.              │
// └──────────────────────────────────────────────────────────────┘

/** @type {Pattern} */
export default {
    name: '탄막 템플릿',

    // 클리어 방법 둘 중 하나
    clear: 'boss', // 보스를 잡으면 클리어  → hp 를 쓴다
    hp: 1200, // 초당 60씩 깎인다. 1200 = 최소 20초
    // clear: 'survival',     // 시간을 버티면 클리어  → seconds 를 쓴다
    // seconds: 40,

    thresholds: [0.5], // 체력 50%를 지나면 s.phase 가 0 -> 1 이 된다
    difficulty: { density: 3, speed: 3, special: 2 }, // 0~10, UI에 막대로 표시

    // 위의 @type {Pattern} 덕분에 여기 s 는 자동으로 Stage 로 잡힌다 (자동완성 O)
    *main(s) {
        const boss = s.boss; // 보스는 엔진이 만들어 준다

        // 1) 등장: 위쪽 가운데로 90프레임(1.5초) 동안 이동
        yield* boss.moveTo(0, s.bounds.top + boss.h / 2 - 10, 90);

        // 2) 1페이즈를 임계점 넘을 때까지 돌린다
        const first = s.fork(ring(s, boss), boss); // 병렬로 공격 시작
        yield s.untilPhaseChange(); // 체력 50%를 지날 때까지 기다림
        s.cancel(first); // 공격 정리
        s.clearBullets();
        yield 60; // 1초 쉬고

        // 3) 2페이즈 (마지막이므로 보스가 죽을 때까지 계속)
        yield* aimed(s, boss);
    },
};

// ── 1페이즈: 원형으로 퍼지는 탄 ─────────────────────────────────
/** @param {S} s */
function* ring(s, boss) {
    let angle = 0;
    while (true) {
        s.fireRing({
            count: 16, // 16발을 원형으로
            angle, // 시작 각도 (조금씩 돌려서 나선처럼)
            x: boss.x,
            y: boss.y, // 어디서 나갈지
            speed: 2, // 프레임당 픽셀 (2 = 초당 120px)
            color: s.C.magenta, // s.C 에 팔레트가 들어 있다
        });
        angle += s.deg(7); // 도 -> 라디안
        yield 30; // 30프레임(0.5초) 대기
    }
}

// ── 2페이즈: 플레이어를 노리는 부채꼴 ───────────────────────────
/** @param {S} s */
function* aimed(s, boss) {
    while (true) {
        s.fireFan({
            count: 5,
            angle: s.aim(boss), // 보스에서 플레이어를 향하는 각도
            spread: s.deg(30), // 전체로 30도 벌어지게
            x: boss.x,
            y: boss.y,
            speed: 2.6,
            shape: 'wedge', // circle | orb | wedge | rod
            size: 4,
            color: s.C.cyan,
        });
        yield 45;
    }
}

// ── 자주 쓰는 것들 (필요할 때 복사해서 쓰기) ────────────────────
//
// 대기          yield 30                 30프레임
//               yield s.untilPhaseChange()
//
// 발사          s.fire({ x, y, angle, speed, color })
//               s.fireRing({ count, angle, x, y, speed })
//               s.fireFan({ count, angle, spread, x, y, speed })
//               s.firePolygon({ sides: 5, radius: 60, center: boss, facing: 'out' })
//
// 각도          s.deg(90)   도를 라디안으로 (아래쪽이 +90도)
//               s.aim(boss) 플레이어를 향하는 각도
//
// 난수          s.rand(1, 3)  s.randInt(0, 5)  s.pick([...])
//
// 동시에 여러 공격
//               공격 하나 = function* 하나. main 에서 fork 로 띄운다.
//                 s.fork(다른공격(s), boss);   // 각자 자기 yield 리듬으로 돈다
//                 s.cancel(t)                  // 멈출 때
//
// 색            s.C.magenta / cyan / yellow / lime / orange / violet / pink ...
//               s.oklch(0.85, 0.2, 30)   s.rainbow(t)
//
// 콘솔에서 전체 목록: engine.stage.help()
