export default {
    name: '부레옥잠 (LUNATIC)',

    clear: 'boss',
    hp: 3200,

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
    while (true) {
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
        s.fireRing({
            count: 3,
            x: s.boss.x,
            y: s.boss.y,
            speed: 1.3,
            color: s.C.blue,
            angle: angle_1,
        });
        yield 4;
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
        s.fireRing({
            count: 3,
            x: s.boss.x,
            y: s.boss.y,
            speed: 1.3,
            color: s.C.blue,
            angle: angle_2,
        });

        angle_1 += s.deg(7.1);
        angle_2 -= s.deg(7.1);
        yield 3;
    }
}

/** @param {S} s */
function* ph1_shoot_2(s) {
    while (true) {
        let angle = s.deg(s.rand(0, 359));
        for (let i = 0; i < 15; i++) {
            angle += s.deg(10);
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
            yield 3;
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
        let rotation = s.deg(s.rand(0, 359));
        s.fire({
            x: s.boss.x,
            y: s.boss.y,
            speed: 6,
            shape: 'orb',
            size: 11,
            r: 7,
            color: s.C.cyan,
            angle: angle + s.deg(10),
            onUpdate(b, s) {
                b.speed -= 0.08;
                if (b.age >= 127) {
                    b.alive = false;
                    s.firePolygon({
                        x: b.x,
                        y: b.y,
                        speed: 5,
                        sides: 4,
                        rotation: rotation,
                        ramp: { color: [s.oklch(0.8, 0.2, 20), s.oklch(0.8, 0.2, 200)] },

                        radius: 1,
                        perSide: 11,
                        keepShape: true,
                        onUpdate(b) {
                            if (b.age < 30) b.speed *= 0.98;
                        },
                    });
                }
            },
        });
        s.fire({
            x: s.boss.x,
            y: s.boss.y,
            speed: 6,
            shape: 'orb',
            size: 11,
            r: 7,
            color: s.C.cyan,
            angle: angle + s.deg(-10),
            onUpdate(b, s) {
                b.speed -= 0.08;
                if (b.age >= 127) {
                    b.alive = false;
                    s.firePolygon({
                        x: b.x,
                        y: b.y,
                        speed: 5,
                        sides: 4,
                        rotation: rotation + s.deg(45),
                        ramp: { color: [s.oklch(0.8, 0.2, 20), s.oklch(0.8, 0.2, 200)] },

                        radius: 1,
                        perSide: 11,
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
        for (let i = 0; i < 72; i++) {
            s.fire({
                x: s.boss.x,
                y: s.boss.y,
                speed: 4,
                shape: 'wedge',
                size: 5,
                r: 3,
                color: s.C.green,
                angle: angle,
            });
            s.fire({
                x: s.boss.x,
                y: s.boss.y,
                speed: 4,
                shape: 'wedge',
                size: 5,
                r: 3,
                color: s.C.yellow,
                angle: angle + s.deg(180),
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
            sides: 5,
            rotation: rotation,
            ramp: { color: [s.oklch(0.8, 0.3, 20), s.oklch(0.8, 0.3, 200)] },

            radius: 1,
            perSide: 4,
            keepShape: true,
            motion: { type: 'bounce', times: 3 },
        });
        yield 120;
    }
}

/** @param {S} s */
function* ph3_shoot_2(s) {
    yield 40;
    while (true) {
        let angle = s.deg(s.rand(0, 359));
        s.fireRing({
            count: 24,
            x: s.boss.x,
            y: s.boss.y,
            speed: 2.7,
            color: s.C.green,
            angle: angle,
        });
        s.fireRing({
            count: 24,
            x: s.boss.x,
            y: s.boss.y,
            speed: 3,
            color: s.C.green,
            angle: angle + s.deg(7.5),
        });
        yield 55;
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
