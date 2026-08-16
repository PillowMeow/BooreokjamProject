export default {
    name: '호부「세계의 부레옥잠」 (HARD)',

    clear: 'boss',
    hp: 2400,

    thresholds: [0.1, 0.85],
    difficulty: { density: 4, speed: 5, special: 5 },

    *main(s) {
        const boss = s.boss;
        yield* boss.moveTo(0, -150, 60);
        yield* phase(s, ph1(s));
        s.showTitle('호부 「세계의 부레옥잠」');
        s.addShake(10, 30);
        yield 30;
        yield* boss.moveTo(0, -150, 20);
        yield* phase(s, ph2(s));
        s.hideTitle();
        s.addShake(10, 60);
        yield 30;
        yield* phase(s, ph1(s));
    },
};

/** @param {S} s */
function* phase(s, routine) {
    const task = s.fork(routine, s.boss);

    yield s.untilPhaseChange();

    s.cancel(task);
    s.clearBullets();
    if (s.result) return;
}

/** @param {S} s */
function* move(s) {
    const baseX = 0,
        baseY = -150;
    let t = 0;
    while (true) {
        t++;
        s.boss.x = baseX + Math.sin((t / 360) * s.TAU) * 60;
        s.boss.y = baseY;
        yield;
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
    let angle = s.deg(s.rand(0, 359));
    while (true) {
        angle += s.deg(57);
        s.fireFan({
            count: 6,
            x: s.boss.x,
            y: s.boss.y,
            speed: 2,
            shape: 'orb',
            size: 11,
            spread: s.deg(180),
            color: s.C.blue,
            angle: angle,
        });
        yield 30;
    }
}

/** @param {S} s */
function* ph1_shoot_2(s) {
    let angle = s.deg(s.rand(0, 359));
    while (true) {
        for (let i = 0; i < 3; i++) {
            angle += s.deg(20);
            s.fireStar({
                x: s.boss.x,
                y: s.boss.y,
                speed: 2,
                ramp: { color: [s.oklch(0.8, 0.3, 110), s.oklch(0.8, 0.3, 180)] },
                rotation: angle,
                points: 5,
                inner: 1,
                outer: 2,
                perEdge: 4,
                keepShape: true,
            });
            yield 20;
        }
        yield 120;
    }
}

/** @param {S} s */
function* ph2(s) {
    s.fork(ph2_shoot_1(s), s.boss);
    s.fork(ph2_modify(s), s.boss);
    while (true) yield;
}

/** @param {S} s */
function* ph2_shoot_1(s) {
    let iter = 0;
    while (true) {
        let angle = s.deg(Math.sin((iter / 360) * 3.14) * 30 + 90);
        for (const b of s.bullets.active.slice()) {
            if (!b.data) continue;
            b.angle = angle;
        }
        let x = s.rand(-680, 680);
        s.fire({
            x: x,
            y: -240,
            speed: 2.3,
            color: s.C.cyan,
            angle: angle,
            margin: 400,
            data: { type: '1' },
        });
        x = s.rand(-680, 680);
        s.fire({
            x: x,
            y: -240,
            speed: 2.3,
            color: s.C.green,
            angle: angle,
            margin: 400,
            data: { type: '2' },
        });
        iter++;
        yield 2;
    }
}

/** @param {S} s */
function* ph2_modify(s) {
    const CYCLE = 360;
    const GROW = 30;
    const SWEEP = 30;
    const SMALL = 3,
        BIG = 20;
    const SMALL_R = 2.5,
        BIG_R = 20;
    const SMALL_SPEED = 3.6,
        BIG_SPEED = 2.3;

    const W = s.bounds.right - s.bounds.left;
    const H = s.bounds.bottom - s.bounds.top;

    while (true) {
        for (const b of s.bullets.active) {
            if (!b.data) continue;
            const q = s.clamp(((b.x - s.bounds.left) / W + (b.y - s.bounds.top) / H) / 2, 0, 1);
            const growStart = b.data.type === '1' ? 180 : 0;
            const t = (((s.frame - SWEEP * q - growStart) % CYCLE) + CYCLE) % CYCLE;
            let k;
            if (t < GROW) k = s.ease.sine(t / GROW);
            else if (t < CYCLE / 2) k = 1;
            else if (t < CYCLE / 2 + GROW) k = 1 - s.ease.sine((t - CYCLE / 2) / GROW);
            else k = 0;

            b.size = s.lerp(SMALL, BIG, k);
            b.r = s.lerp(SMALL_R, BIG_R, k);
            b.speed = s.lerp(SMALL_SPEED, BIG_SPEED, k);
            b.shape = k > 0.35 ? 'orb' : 'circle';
        }
        yield;
    }
}

/*
        x: -192          0          +192
y:-224  ┌──────────────┬──────────────┐   ← top
        │              │              │
        │              │              │
    0   ├──────────────●──────────────┤   ● = (0, 0)
        │              │              │
        │              │              │
y:+224  └──────────────┴──────────────┘   ← bottom
*/
