export default {
    name: '평범한 부레옥잠 (EASY)',

    clear: 'boss',
    hp: 1600,

    thresholds: [0.33, 0.66],
    difficulty: { density: 3, speed: 3, special: 2 },

    *main(s) {
        const boss = s.boss;
        yield* boss.moveTo(0, -150, 90);
        yield* phase(s, ph1(s));
        yield* boss.moveTo(0, -150, 30);
        yield* phase(s, ph2(s));
        yield* boss.moveTo(0, -150, 30);
        yield* phase(s, ph3(s));
        yield* boss.moveTo(0, -150, 30);
    },
};

/** @param {S} s */
function* phase(s, routine) {
    const task = s.fork(routine, s.boss);

    yield s.untilPhaseChange();

    s.cancel(task);
    s.clearBullets();
    if (s.result) return;
    yield 30;
}

/** @param {S} s */
function* move(s) {
    const baseX = 0,
        baseY = -150;
    let t = 0;
    while (true) {
        t++;
        s.boss.x = baseX + Math.sin((t / 360) * s.TAU) * 60; // 120프레임에 한 번 왕복
        s.boss.y = baseY;
        yield; // 매 프레임
    }
}

/** @param {S} s */
function* ph1(s) {
    s.fork(move(s), s.boss);
    s.fork(ph1_shoot_1(s), s.boss);
    s.fork(ph1_shoot_2(s), s.boss);
    while (true) yield;
}

/** @param {S} s */
function* ph1_shoot_1(s) {
    let angle_1 = s.deg(90);
    let angle_2 = s.deg(90);
    let iter = 0;
    while (true) {
        if (iter % 20 < 10) {
            s.fireRing({
                count: 6,
                x: s.boss.x,
                y: s.boss.y,
                speed: 2,
                color: s.C.magenta,
                angle: angle_1,
                onUpdate(b) {
                    if (b.age <= 120) {
                        b.speed += 0.015;
                    }
                },
            });
        } else {
            s.fireRing({
                count: 6,
                x: s.boss.x,
                y: s.boss.y,
                speed: 2,
                color: s.C.lime,
                angle: angle_2,
                onUpdate(b) {
                    if (b.age <= 120) {
                        b.speed += 0.015;
                    }
                },
            });
        }
        angle_1 += s.deg(9);
        angle_2 -= s.deg(9);
        iter++;
        yield 8;
    }
}

/** @param {S} s */
function* ph1_shoot_2(s) {
    while (true) {
        let angle = s.deg(s.rand(0, 359));
        for (let i = 0; i < 7; i++) {
            angle += s.deg(20);
            s.fireRing({
                count: 4,
                x: s.boss.x,
                y: s.boss.y,
                speed: 2,
                shape: 'orb',
                size: 11,
                r: 7,
                color: s.C.white,
                angle: angle,
            });
            yield 7;
        }
        yield 180;
    }
}

/** @param {S} s */
function* ph2(s) {
    s.fork(move(s), s.boss);
    s.fork(ph2_shoot_1(s), s.boss);
    s.fork(ph2_shoot_2(s), s.boss);
    while (true) yield;
}

/** @param {S} s */
function* ph2_shoot_1(s) {
    while (true) {
        let angle = s.deg(s.rand(70, 110));
        s.fire({
            x: s.boss.x,
            y: s.boss.y,
            speed: 6,
            shape: 'orb',
            size: 11,
            r: 7,
            color: s.C.cyan,
            angle: angle,
            onUpdate(b, s) {
                b.speed -= 0.08;
                if (b.age >= 127) {
                    b.alive = false;
                    s.firePolygon({
                        x: b.x,
                        y: b.y,
                        speed: 6,
                        sides: 4,
                        rotation: s.deg(s.rand(0, 359)),
                        ramp: { color: [s.oklch(0.8, 0.2, 20), s.oklch(0.8, 0.2, 200)] },

                        radius: 1,
                        perSide: 3,
                        keepShape: true,
                        onUpdate(b) {
                            if (b.age < 30) b.speed *= 0.98;
                        },
                    });
                }
            },
        });
        yield 47;
    }
}

/** @param {S} s */
function* ph2_shoot_2(s) {
    yield 100;
    while (true) {
        let angle = s.deg(s.rand(0, 359));
        for (let i = 0; i < 36; i++) {
            s.fire({
                x: s.boss.x,
                y: s.boss.y,
                speed: 3.5,
                shape: 'wedge',
                size: 5,
                r: 3,
                color: s.C.green,
                angle: angle,
            });
            angle += s.deg(48.88);
            yield 1;
        }
        yield 80;
    }
}

/** @param {S} s */
function* ph3(s) {
    s.fork(move(s), s.boss);
    s.fork(ph3_shoot_1(s), s.boss);
    s.fork(ph3_shoot_2(s), s.boss);
    while (true) yield;
}

/** @param {S} s */
function* ph3_shoot_1(s) {
    while (true) {
        let rotation = s.deg(s.rand(0, 359));
        s.firePolygon({
            x: s.boss.x,
            y: s.boss.y,
            speed: 2,
            shape: 'orb',
            size: 11,
            r: 7,
            sides: 4,
            rotation: rotation,
            ramp: { color: [s.oklch(0.8, 0.3, 20), s.oklch(0.8, 0.3, 200)] },

            radius: 1,
            perSide: 1,
            keepShape: true,
            motion: { type: 'bounce', times: 3 },
        });
        yield 80;
    }
}

/** @param {S} s */
function* ph3_shoot_2(s) {
    yield 40;
    while (true) {
        let angle = s.deg(s.rand(0, 359));
        s.fireRing({
            count: 6,
            x: s.boss.x,
            y: s.boss.y,
            speed: 2.7,
            color: s.C.green,
            angle: angle,
        });
        s.fireRing({
            count: 6,
            x: s.boss.x,
            y: s.boss.y,
            speed: 3.6,
            color: s.C.green,
            angle: angle + s.deg(30),
        });
        yield 37;
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
// 병렬 공격      const t = s.fork(다른제너레이터(s, boss), boss);  s.cancel(t)
//               s.every(20, () => s.fireRing({ ... }))
//
// 색            s.C.magenta / cyan / yellow / lime / orange / violet / pink ...
//               s.oklch(0.85, 0.2, 30)   s.rainbow(t)
//
// 콘솔에서 전체 목록: engine.stage.help()
