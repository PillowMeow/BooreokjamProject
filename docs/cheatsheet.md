# 치트시트

한 장짜리 요약. 이것만 알면 탄막은 만들어진다.
더 필요해지면 그때 [patterns.md](patterns.md)를 보면 된다.

---

## 뼈대

```js
export default {
  name: '내 탄막',
  clear: 'boss', hp: 1200,              // 또는 clear: 'survival', seconds: 40
  difficulty: { density: 3, speed: 3, special: 2 },

  /** @param {import('../engine/stage.js').Stage} s */
  *main(s) {
    while (true) {
      s.fireRing({ count: 16, x: s.boss.x, y: s.boss.y, speed: 2, color: s.C.magenta });
      yield 30;
    }
  },
};
```

- **`s`가 전부다.** import 할 것이 없다.
- `*main`은 제너레이터(`function*`)여야 하고, 루프 안에는 **반드시 `yield`**가 있어야 한다.
- [`src/patterns/template.js`](../src/patterns/template.js)를 복사해서 시작하는 게 제일 빠르다.

## 기본 규칙 5개

| | |
|---|---|
| 시간 | 전부 **프레임**. 60프레임 = 1초 |
| 좌표 | 화면 중앙이 `(0, 0)`, **아래쪽이 +y**, 필드는 384×448 |
| 각도 | 라디안. `s.deg(90)`으로 변환. **0=오른쪽, 90=아래, -90=위** |
| 속도 | 프레임당 픽셀. `speed: 2` = 초당 120px |
| 색 | `s.C.magenta` 같은 팔레트. 어두운 색은 배경에 묻힌다 |

## 대기 (`yield`)

```js
yield 30;                      // 30프레임 기다림
yield;                         // 1프레임
yield s.untilPhaseChange();    // 임계점을 넘을 때까지
yield s.until(() => s.boss.hp < 300);
yield* boss.moveTo(0, -150, 90);   // 이동이 끝날 때까지
```

## 쏘기

```js
s.fire({ x, y, angle, speed, color })                    // 1발
s.fireRing({ count: 16, angle, x, y, speed })            // 원형
s.fireFan({ count: 5, angle, spread: s.deg(30), x, y, speed })   // 부채꼴
s.firePolygon({ sides: 5, radius: 60, center: boss, facing: 'out', speed: 1.5 })
```

### 다각형으로 쏘기

```js
// 오각형이 모양 그대로 커지며 퍼진다  ← 보통 원하는 것
s.firePolygon({ sides: 5, radius: 40, perSide: 6, center: boss,
                facing: 'out', keepShape: true, speed: 2.5, color: s.C.cyan });

// 꼭짓점에서만 (5발)
s.firePolygon({ sides: 5, radius: 60, mode: 'vertex', center: boss, facing: 'out', speed: 2 });

// 쏠 때마다 조금씩 돌리면 회전하는 다각형
let rot = 0;
while (true) {
  s.firePolygon({ sides: 6, radius: 40, perSide: 5, center: boss,
                  rotation: rot, facing: 'out', keepShape: true, speed: 2 });
  rot += s.deg(12);
  yield 30;
}

// 다각형 궤도를 따라 도는 탄
const path = s.pathPolygon(3, 110, { center: { x: 0, y: -40 } });
s.firePath(path, { count: 12, facing: 'along', speed: 0,
                   motion: { type: 'path', path, frames: 240, loop: true } });
```

- `sides` 변의 수 / `radius` 크기 / `perSide` 변마다 몇 발 / `rotation` 전체 회전
- `mode: 'vertex'`면 꼭짓점에만, 기본값 `'outline'`은 변을 채운다
- `keepShape: true`가 없으면 퍼질수록 모서리가 뭉개져 원처럼 된다

자주 쓰는 탄 속성:

```js
{ speed: 2, angle: s.deg(90), color: s.C.cyan,
  shape: 'circle',   // circle | orb(큰 원) | wedge(삼각) | rod(막대)
  size: 3, r: 2.5,   // 그리기 크기 / 판정 반지름
  accel: 0.02,       // 가속
  omega: s.deg(1),   // 매 프레임 휘는 각도
  delay: 20 }        // 예고 후 등장
```

## 방향 잡기

```js
s.aim(boss)                    // 보스 -> 플레이어 각도 (조준탄)
s.aim(boss) + s.deg(10)        // 살짝 빗나가게
angle += s.deg(7)              // 조금씩 돌리면 나선이 된다
```

## 동시에 여러 공격

**공격 하나 = `function*` 하나.** `main`에서 `fork`로 띄우면 각자 자기 리듬으로 돈다.
이게 전부다 — 콜백도, `every`도 필요 없다.

```js
*main(s) {
  s.fork(링공격(s), s.boss);      // 셋이 동시에 돈다
  s.fork(연발공격(s), s.boss);
  s.fork(비(s), s.boss);
  while (true) yield;             // main 은 살아만 있으면 된다
}

function* 링공격(s) {
  while (true) {
    s.fireRing({ count: 16, x: s.boss.x, y: s.boss.y, speed: 2 });
    yield 60;                     // 60프레임마다
  }
}

function* 연발공격(s) {
  yield 78;                       // 80프레임에 시작 (지연도 그냥 yield)
  while (true) {
    for (let i = 0; i < 3; i++) { s.fireFan({ ... }); yield 10; }   // 3연발
    yield 70;                     // 10×3 + 70 = 100 주기
  }
}

function* 비(s) {
  while (true) {
    s.fire({ ... });
    yield s.randInt(8, 14);       // 불규칙한 간격도 그냥 yield
  }
}
```

위 코드의 실제 실행 프레임: 링 `2, 62, 122, 182` / 연발 `80, 90, 100, 180, 190, 200` / 비는 8~14 간격.

- `yield` 숫자를 더한 값이 그 공격의 주기다. 리듬을 코드 모양 그대로 적으면 된다.
- 두 번째 인자로 `s.boss`를 주면 보스가 죽을 때 같이 멈춘다.
- `const t = s.fork(...)` 로 받아두면 `s.cancel(t)` 로 그 공격만 멈출 수 있다 (페이즈 전환).

> `s.every(20, fn)` / `s.burst({...})` / `s.after(60, fn)` 같은 것도 있지만,
> **콜백 안에서는 `yield`를 쓸 수 없어서** 조금만 복잡해져도 그 안에 또 `fork`를 넣어야 한다.
> 그냥 위처럼 `function*` + `fork`로 쓰는 편이 항상 더 단순하다. `every`는 한 줄짜리 반복에만 쓸 것.

## 페이즈 나누기

```js
thresholds: [0.66, 0.33],   // 체력(또는 시간) 게이지가 지나면 s.phase 가 오른다

*main(s) {
  yield* phase(s, 공격1(s, s.boss));
  yield* phase(s, 공격2(s, s.boss));
  yield* 마지막공격(s, s.boss);      // 마지막은 계속 돌린다
}
function* phase(s, 루틴) {
  const t = s.fork(루틴, s.boss);
  yield s.untilPhaseChange();
  s.cancel(t);
  s.clearBullets();
  yield 60;
}
```

## 색

```js
s.C.magenta  s.C.cyan  s.C.yellow  s.C.lime  s.C.green
s.C.orange   s.C.blue  s.C.violet  s.C.pink  s.C.red  s.C.white

s.rainbow(0.3)              // 무지개 한 바퀴 중 30% 지점
s.oklch(0.85, 0.2, 30)      // 밝기 0~1, 채도 0~0.37, 색상 0~360
ramp: { color: [s.C.cyan, s.C.magenta] }   // 발사 안에서 색 그라데이션
```

## 자주 하는 실수

| 증상 | 원인 |
|---|---|
| 브라우저가 멈춘다 | 루프 안에 `yield`가 없다 |
| 탄이 안 보인다 | `x`, `y`를 안 줬다(원점에서 나감) / `speed: 0` |
| 위로 쐈는데 아래로 간다 | 아래가 +y다. 위는 `s.deg(-90)` |
| 페이즈를 넘겼는데 옛 탄이 계속 | `s.cancel(t)`를 안 했다 |
| 클리어가 안 된다 | `clear: 'boss'`인데 `main`이 먼저 끝났다 |

---

## 막히면

- **편집기 자동완성**: `*main(s)` 위에 `/** @param {import('../engine/stage.js').Stage} s */`를 붙이면
  VS Code에서 `s.`을 칠 때 함수 목록이 뜬다. 템플릿에는 이미 들어 있다.
- **콘솔에서 목록 보기**: F12 → `engine.stage.help()` (이름으로 거르려면 `engine.stage.help('fire')`)
- **살아 있는 값 보기**: `engine.stage.boss`, `engine.stage.bulletCount`, `engine.paused = true`
- 전체 명세는 [patterns.md](patterns.md), 배치·거동·색 헬퍼는 그 문서 §14.
