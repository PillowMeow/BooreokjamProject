# 탄막 패턴 작성 명세

이 문서는 `.js` 탄막 파일 하나를 어떻게 쓰는지 전부 설명한다.
엔진 쪽 구조는 [README](../README.md)를 보면 되고, 여기서는 **패턴 작성자가 알아야 할 것만** 다룬다.

---

## 1. 파일 형식

패턴 파일은 ES 모듈이고, `export default`로 객체 하나를 내보낸다.

```js
export default {
  name: '샘플 보스',        // 필수. UI·콘솔·탭 제목에 뜨는 이름
  clear: 'boss',            // 'boss' | 'survival'
  hp: 1800,                 // clear: 'boss' 일 때 보스 체력
  seconds: 40,              // clear: 'survival' 일 때 버틸 시간(초)
  thresholds: [0.66, 0.33], // 임계점
  sprite: './sprites/boss.png',
  spriteScale: 0.21,

  init(s) {},               // 선택
  *main(s) {},              // 필수. 반드시 제너레이터(function*)
};
```

`main`이 제너레이터가 아니면 로드 시점에 에러가 난다.

### 최소 패턴

```js
export default {
  name: '최소 예제',
  clear: 'boss',
  hp: 600,
  *main(s) {
    while (true) {
      s.fireRing({ count: 12, x: s.boss.x, y: s.boss.y, speed: 2 });
      yield 30;
    }
  },
};
```

이 8줄이면 돌아간다. 보스는 엔진이 만들어 주고, 플레이어가 보스를 깎아 죽이면 클리어된다.

---

## 2. 등록과 로딩

세 가지 방법이 있다.

| 방법 | 하는 법 | 제약 |
|---|---|---|
| 내장 목록 | [`src/patterns/index.js`](../src/patterns/index.js)에 `{ label, path }` 한 줄 추가 | 없음 |
| 주소로 지정 | `?p=./patterns/내파일.js` (경로는 `src/` 기준) | 없음 |
| 로컬 파일 열기 | UI 패널의 "파일 열기" | **파일 안에서 상대 import 불가** |

로컬 파일은 Blob URL로 import되기 때문에 `import { C } from '../palette.js'`가 동작하지 않는다.
**남에게 건네줄 패턴은 import 없이 한 파일로 끝나야 한다.** 팔레트는 `s.C`로 그대로 쓸 수 있고
(`color: s.C.cyan`), 헬퍼도 전부 `s.*`에 있으니 import할 게 없다. 도우미 함수는 같은 파일 안에 두면 된다.

`?seed=999`로 난수 시드를 바꿀 수 있다. 시드가 같고 조작이 같으면 결과는 항상 같다.

---

## 3. 메타데이터

### `clear` — 클리어 조건

| 값 | 뜻 | 게이지 | 보스 |
|---|---|---|---|
| `'boss'` (기본) | 보스 체력을 0으로 만들면 클리어 | 빨간색, 체력 비율 | 플레이어 탄에 맞음 |
| `'survival'` | 정해진 시간을 버티면 클리어 | 파란색, 남은 시간 비율 | 무적 |

`clear`를 안 쓰면 `'boss'`로 본다.

### `hp` / `seconds`

- `clear: 'boss'` → `hp` (기본 1000). 플레이어 화력은 **초당 60 정도**다(샷 2발 × 데미지 2 ÷ 4프레임, 둘 다 명중 기준).
  즉 `hp: 1800`이면 계속 쏴서 맞힐 때 약 30초. 실제로는 회피하느라 못 쏘는 시간이 있으니 이보다 길어진다.
- `clear: 'survival'` → `seconds` (기본 60). 프레임으로 환산되어 `s.duration`에 들어간다.

### `thresholds` — 임계점

게이지가 이 값 아래로 내려갈 때마다 `s.phase`가 1씩 오르고, 보스바에 눈금이 찍힌다.

```js
thresholds: [0.66, 0.33]   // 비율
thresholds: [1200, 600]    // hp: 1800 이면 위와 같은 뜻 (1보다 크면 절대값으로 본다)
```

- 정렬은 알아서 해준다(내림차순으로 정규화된다).
- `0` 이하, `1` 이상은 버려진다.
- 구간 수 = `thresholds.length + 1`. 위 예시는 3구간(`s.phase`가 0, 1, 2).

### `sprite` / `spriteScale`

- `sprite`를 생략하면 `./sprites/boss.png`를 쓴다. 경로는 `index.html` 기준.
- **히트박스는 그려지는 사각형 그대로**다 (`boss.w` × `boss.h`). 원이 아니다.
- `spriteScale`을 생략하면 **세로 54px**에 맞춰 자동 축소한다. 448×256 스프라이트면 94.5×54가 된다.
- 이미지를 못 불러오면 콘솔에 경고가 뜨고 보스는 32px 원으로 대체된다.

### `init(s)`

`main`이 시작되기 전에 한 번 호출된다. 보스는 이미 만들어져 있다.
상태 변수를 미리 만들어 두거나 보스 색을 바꾸는 정도로 쓴다. 여기서 `yield`는 못 한다.

---

## 4. 실행 모델

- 시뮬레이션은 **고정 60fps**다. 모니터 주사율과 무관하게 1프레임 = 1/60초.
- `main(s)`는 태스크 하나로 등록되어 매 프레임 한 번씩 재개된다.
- 한 프레임의 처리 순서는 이렇다.

```
1. 폭탄 입력(X) 처리
2. 태스크 실행     ← 패턴 코드가 도는 지점
3. 플레이어 이동·샷
4. 탄 이동, 화면 밖 제거
5. 죽은 적 정리
6. 충돌 판정 (플레이어 탄 vs 적, 적탄 vs 플레이어)
7. 클리어 판정
```

패턴이 프레임 맨 앞에서 돌기 때문에, `s.fire()`로 낸 탄은 **그 프레임에 이미 한 번 움직인 뒤** 화면에 그려진다.

### 클리어와 종료

- `clear: 'boss'` → 보스가 죽는 순간
- `clear: 'survival'` → `s.frame >= s.duration`인 순간

클리어되면 엔진이 `main` 태스크(와 그 하위 태스크 전부)를 취소하고, 탄과 적을 지우고, 결과 화면을 띄운다.
**`main`이 그냥 끝나는 것으로는 클리어되지 않는다.** `clear: 'boss'`인데 `main`이 일찍 리턴하면
보스는 살아 있고 아무 공격도 안 하는 상태로 남는다. 마지막 구간은 `while (true)`로 계속 돌리거나
`s.boss.kill(s)`로 직접 끝내야 한다.

---

## 5. 좌표계와 단위

```
        x: -192          0         +192
   y:-224  ┌─────────────┬─────────────┐  ← 필드 위쪽 (보스바가 붙는 곳)
           │             │             │
        0  ├─────────────●─────────────┤  ● = (0, 0)
           │             │             │
   y:+224  └─────────────┴─────────────┘  ← 필드 아래쪽 (플레이어 시작 근처)
```

- 필드는 **384 × 448**, 중앙이 원점. `s.bounds`로 읽는다: `{ left: -192, right: 192, top: -224, bottom: 224 }`
- **y는 아래쪽이 양수**다. 위로 쏘려면 `-90도`, 아래로 쏘려면 `+90도`.
- 각도는 **라디안**. `0` = 오른쪽(+x), 값이 커지면 화면상 **시계 방향**.
  - 오른쪽 `0`, 아래 `s.deg(90)`, 왼쪽 `s.deg(180)`, 위 `s.deg(-90)`
- 속도는 **프레임당 픽셀**. `speed: 3` = 초당 180px. 필드를 세로로 가로지르는 데 약 2.5초.
- 시간은 전부 **프레임**. 1초 = 60프레임.
- 탄은 필드 밖으로 **48px** 이상 나가면 자동 제거된다. 화면 밖에서 등장시키려면 이보다 가까이서 만들어야 한다.

### 참고 수치

| 항목 | 값 |
|---|---|
| 플레이어 판정 반지름 | 2.5px |
| 플레이어 이동 속도 | 3.6px/프레임 (Shift 저속 1.6) |
| 스침(그레이즈) 반경 | 18px |
| 무적 시간 | 사망 120프레임 / 폭탄 60프레임 |
| 화면상 탄 최대 개수 | 20000 |

---

## 6. yield 규칙

`main`과 모든 태스크는 제너레이터다. `yield`한 값에 따라 언제 재개될지가 정해진다.

| 쓰는 법 | 뜻 |
|---|---|
| `yield` | 다음 프레임에 재개 |
| `yield 30` | 30프레임 뒤에 재개 (`s.wait(30)`과 동일) |
| `yield s.until(() => 조건)` | 조건이 참이 되는 첫 프레임에 재개 |
| `yield s.untilGauge(0.5)` | 게이지가 0.5 이하가 될 때까지 |
| `yield s.untilPhaseChange()` | 다음 임계점을 넘을 때까지 (클리어되면 즉시 풀림) |
| `yield s.join(task)` | 그 태스크가 끝날 때까지 |
| `yield* 다른제너레이터(s)` | 그 제너레이터에 위임. 끝나면 이어서 진행 |

주의할 점:

- `yield 0`과 `yield 1`은 똑같이 **1프레임**이다. 0프레임 대기는 없다.
- 조건 검사는 **다음 프레임부터** 시작한다. 지금 이미 참이어도 최소 1프레임은 지난다.
- `yield` 없는 `while (true)`는 브라우저를 멈춘다. 루프 안에는 반드시 `yield`가 있어야 한다.
- 태스크 안에서 예외가 나면 그 태스크만 죽고 콘솔에 찍힌다. 다른 태스크는 계속 돈다.

---

## 7. 병렬 태스크

`s.fork()`로 여러 공격을 동시에 굴린다.

```js
const task = s.fork(routine(s, s.boss), s.boss);   // 제너레이터 또는 (s)=>제너레이터
s.cancel(task);                                     // 취소
```

세 가지 규칙만 기억하면 된다.

1. **부모-자식**: 태스크 A가 실행 중에 `s.fork()`하면 그 태스크는 A의 자식이 된다.
   `s.cancel(A)`는 A가 만든 자식까지 전부 정리한다. 페이즈 전환에서 새는 태스크가 없다.
2. **owner**: 두 번째 인자로 준 객체의 `alive`가 `false`가 되면 태스크도 같이 끝난다.
   적이 쏘는 루틴에는 항상 그 적을 owner로 주는 게 좋다. `enemy.fork(fn)`은 owner가 자동으로 그 적이다.
3. **생성 시점**: `fork`한 태스크는 **다음 프레임부터** 돈다. 같은 프레임에 즉시 실행되지 않는다.

---

## 8. Stage API

`main(s)`의 `s`가 Stage다. 패턴은 이 객체를 통해서만 세계를 건드린다.

### 발사

```js
s.fire(opts)                                   // 탄 1개. Bullet을 돌려준다 (한도 초과면 null)
s.fireRing({ count, angle, ...탄속성 })         // 원형 일제사. Bullet 배열
s.fireFan({ count, angle, spread, ...탄속성 })  // 부채꼴. Bullet 배열
```

> 배치 함수(`fireLine` / `firePolygon` / `firePath` …)와 공통 옵션(`origin`, `rotation`, `facing`,
> `aimType`, `ramp`)은 **§14**를 볼 것.

- `fireRing`의 `angle`은 **첫 탄의 각도**다. 나머지는 `TAU/count` 간격으로 채워진다.
- `fireFan`의 `angle`은 **중심각**, `spread`는 전체 벌어짐 각(라디안). `count: 1`이면 `angle` 방향으로 한 발.
- 셋 다 `x`, `y`를 안 주면 `(0, 0)`에서 나간다. 보통 `x: boss.x, y: boss.y`를 넣는다.

### 탄 제거

```js
s.clearBullets()    // 전멸 (bombProof 포함)
s.clearBombable()   // bombProof가 아닌 탄만 — 폭탄과 같은 판정
s.bomb()            // 폭탄 효과 전체 (탄 제거 + 무적 1초 + 흔들림 + 사용 횟수 +1)
```

### 적

```js
const e = s.spawn({ x, y, hp, r, color, invuln, boss, onDeath, data })
e.damage(20, s)
e.kill(s)
yield* e.moveTo(x, y, frames)   // 부드럽게 이동 (ease-in-out)
e.fork(genFn)                   // 이 적이 죽으면 같이 끝나는 태스크
```

- `s.spawn`으로 만든 적은 **반지름 `r`인 원 판정**이다(기본 16). 스프라이트를 주면 사각 판정이 된다.
- `boss: true`를 주면 그 적이 게이지의 주인이 된다. 보통 쓸 일이 없다 — 보스는 엔진이 이미 만들었다.
- `onDeath(enemy, stage)`로 죽을 때 탄을 뿌릴 수 있다.

### 조회

| 이름 | 뜻 |
|---|---|
| `s.boss` | 엔진이 만든 보스 (Enemy) |
| `s.enemies` | 살아 있는 적 배열 (보스 포함) |
| `s.player` | 플레이어. `x`, `y`, `deaths`, `graze`, `invuln` 등 |
| `s.px`, `s.py` | 플레이어 좌표 (짧게 쓰는 용도) |
| `s.frame` | 시작 후 경과 프레임 |
| `s.gauge` | 보스바 값. 1 → 0 |
| `s.phase` | 통과한 임계점 수 (0부터) |
| `s.remaining` | survival 모드 남은 시간(초) |
| `s.bulletCount` | 화면의 적탄 수 |
| `s.bounds` | `{ left, right, top, bottom }` |
| `s.mode` | `'boss'` 또는 `'survival'` |
| `s.thresholds` | 정규화된 임계점 배열 |
| `s.result` | 클리어 전에는 `null` |
| `s.TAU`, `s.PI` | 6.283…, 3.141… |

### 각도·난수

```js
s.aim(from)            // from(=x,y를 가진 무엇이든)에서 플레이어를 향하는 각도
s.angleTo(from, to)    // 임의의 두 점 사이 각도
s.deg(90)              // 도 -> 라디안
s.rand(min, max)       // [min, max) 실수
s.randInt(min, max)    // [min, max] 정수
s.pick(arr)            // 배열에서 하나
```

### 연출

```js
s.addShake(진폭px, 지속프레임)   // 예: s.addShake(6, 15)
```

이미 더 센 흔들림이 걸려 있으면 무시된다. 참고로 폭탄은 `(10, 24)`, 사망은 `(7, 20)`이다.

---

## 9. 탄 속성

`s.fire()`에 넘기는 객체는 Bullet의 필드를 그대로 받는다.

| 필드 | 뜻 | 기본값 |
|---|---|---|
| `x`, `y` | 위치 | `0`, `0` |
| `angle` | 진행 방향(라디안) | `0` |
| `speed` | 프레임당 픽셀 | `0` |
| `accel` | 프레임당 속도 증감 | `0` |
| `omega` | 프레임당 각도 증감 — 휘는 탄 | `0` |
| `minSpeed`, `maxSpeed` | `accel` 적용 시 속도 한계 | `±Infinity` |
| `r` | 판정 반지름 | `2.5` |
| `shape` | `circle` / `orb` / `wedge` / `rod` | `circle` |
| `size` | 그리기 크기 (모양마다 해석이 다름) | `3` |
| `color` | CSS 색 | `#ff5577` |
| `life` | 수명 프레임. `0`이면 무제한 | `0` |
| `bombProof` | 폭탄·사망 효과로 안 지워짐 | `false` |
| `delay` | 등장 지연 프레임. 그동안 판정 없이 예고 표시만 뜬다 (§14.4) | `0` |
| `motion` | 거동 모듈 `{ type, ... }` (§14.3) | `null` |
| `plan` | 예약 변경 목록 (§14.4) | `null` |
| `onUpdate` | `(bullet, stage) => void`, 매 프레임 호출 | `null` |
| `data` | 패턴이 자유롭게 쓰는 칸 | `null` |
| `alive` | `false`로 놓으면 그 탄은 사라진다 | `true` |

매 프레임 처리 순서는 `onUpdate` → `accel` → `omega` → 위치 이동 → 수명·화면 밖 검사다.
즉 `onUpdate` 안에서 바꾼 `speed`나 `angle`은 **그 프레임부터** 반영된다.

### 모양

| shape | 생김새 | `size` | 어울리는 `r` |
|---|---|---|---|
| `circle` | 동그란 탄 | 반지름 | `size - 0.5` |
| `orb` | 큰 원 + 옅은 후광 | 반지름 | `size - 2` |
| `wedge` | 삼각형, 진행 방향을 향함 | 길이 = `size × 2.2` | `size × 0.6` |
| `rod` | 얇은 막대 | 길이 = `size × 3.6`, 폭 = `size × 0.5` | `size × 0.5` |

`wedge`와 `rod`는 `angle`을 따라 회전한다. 판정은 어떤 모양이든 **원**이므로 긴 모양은 `r`을 따로 잡아야 한다.
탄은 단색으로 칠해지고, 가운데에 **그 색을 75% 밝게 올린 속심**이 들어간다. 흰색·검은색은 쓰지 않는다.

### 색

```js
import { C } from '../palette.js';
// C.magenta C.red C.orange C.yellow C.lime C.green C.cyan C.blue C.violet C.pink C.white
```

배경이 검은색이라 어두운 색은 묻힌다. 팔레트는 전부 휘도 0.55 이상이고, 새 색을 넣을 때도 밝은 쪽을 골라야 한다.
(로컬 파일 패턴은 import를 못 하니 `'#ffe95c'`처럼 직접 적는다.)

---

## 10. 관용구

### 페이즈 나누기

```js
*main(s) {
  yield* s.boss.moveTo(0, s.bounds.top + s.boss.h / 2 - 10, 90);
  yield* phase(s, first(s, s.boss));
  yield* phase(s, second(s, s.boss));
  yield* phase(s, last(s, s.boss));    // 마지막은 격파할 때까지 돈다
}

function* phase(s, routine) {
  const task = s.fork(routine, s.boss);
  yield s.untilPhaseChange();
  s.cancel(task);        // 하위 태스크까지 정리된다
  s.clearBullets();
  if (s.result) return;  // 이미 클리어됐으면 여기서 끝
  yield 60;              // 페이즈 사이 여유
}
```

### 조준탄

```js
s.fireFan({
  count: 5, angle: s.aim(boss), spread: s.deg(24),
  x: boss.x, y: boss.y, speed: 3.2, shape: 'wedge', size: 4, r: 2.5, color: C.cyan,
});
```

### 도는 나선

```js
let angle = 0;
while (true) {
  for (let i = 0; i < 3; i++) {
    s.fire({ x: boss.x, y: boss.y, angle: angle + s.TAU * i / 3, speed: 2.6, color: C.violet });
  }
  angle += s.deg(11);
  yield 3;
}
```

각 증가량을 `s.TAU / count`의 약수 근처로 두면 규칙적인 무늬가, 살짝 어긋나게 두면 도는 무늬가 된다.

### 멈췄다가 다시 나가는 탄

```js
s.fire({
  x: boss.x, y: boss.y, angle: s.rand(0, s.TAU), speed: 3,
  accel: -0.06, minSpeed: 0,          // 50프레임쯤 뒤 정지
  color: C.pink,
  onUpdate(b, st) {
    if (b.age === 90) {               // 멈춘 채 잠깐 있다가
      b.angle = st.aim(b);            // 플레이어를 향해
      b.speed = 3.5;                  // 다시 발사
      b.accel = 0;
    }
  },
});
```

### 유도탄 (약하게 휘는 탄)

```js
onUpdate(b, st) {
  if (b.age > 120) return;                       // 계속 따라오면 피할 수 없다
  const want = st.aim(b);
  let diff = want - b.angle;
  while (diff > Math.PI) diff -= st.TAU;
  while (diff < -Math.PI) diff += st.TAU;
  b.angle += Math.max(-0.02, Math.min(0.02, diff));   // 프레임당 최대 0.02라디안
}
```

### 벽에서 튕기는 탄

```js
onUpdate(b, st) {
  const { left, right, top } = st.bounds;
  if ((b.x < left && Math.cos(b.angle) < 0) || (b.x > right && Math.cos(b.angle) > 0)) {
    b.angle = Math.PI - b.angle;
  }
  if (b.y < top && Math.sin(b.angle) < 0) b.angle = -b.angle;
}
```

### 위에서 떨어지는 비

```js
function* rain(s) {
  const { left, right, top } = s.bounds;
  while (true) {
    s.fire({
      x: s.rand(left + 10, right - 10), y: top - 10,   // 컬링 여유(48px) 안쪽에서 만든다
      angle: s.deg(90) + s.rand(-0.25, 0.25),
      speed: s.rand(1.4, 2.4), size: 2.5, r: 2, color: C.green,
    });
    yield 4;
  }
}
```

### 잡몹 소환

```js
const e = s.spawn({ x: -120, y: -60, hp: 60, r: 12, color: C.lime,
  onDeath: (self, st) => st.fireRing({ count: 8, x: self.x, y: self.y, speed: 2, color: C.lime }),
});
e.fork(function* () {                 // 적이 죽으면 이 루틴도 끝난다
  while (true) {
    s.fireFan({ count: 3, angle: s.aim(e), spread: s.deg(20), x: e.x, y: e.y, speed: 2.5 });
    yield 45;
  }
});
```

### 폭탄으로 안 지워지는 탄

```js
s.fireFan({ ..., bombProof: true });
```

페이즈를 정의하는 큰 탄이나 "이건 반드시 피해야 한다"는 탄에만 쓴다. 남발하면 폭탄이 의미를 잃는다.

---

## 11. 지켜야 할 것

### 결정성

같은 시드 + 같은 조작 = 같은 결과가 보장되어야 리플레이·디버깅이 된다.

- `Math.random()` **금지**. `s.rand()`, `s.randInt()`, `s.pick()`을 쓴다.
- `Date.now()`, `performance.now()` **금지**. 시간은 `s.frame`으로 센다.
- 모듈 최상위에서 상태를 갖지 말 것. 재시작(R)해도 초기화되지 않아 두 번째 판이 달라진다.
  상태는 `main` 안의 지역 변수나 `init`에서 만든 값으로 둔다.

```js
let counter = 0;              // ✗ 재시작해도 안 돌아간다
export default {
  *main(s) {
    let counter = 0;          // ✓
  },
};
```

### 성능

- 화면 탄 20000개가 상한이다. 넘으면 `s.fire()`가 `null`을 돌려준다.
- 실사용에서는 500발쯤부터 눈이 따라가지 못한다. 1000발이 넘어가면 패턴 설계를 의심할 것.
- `onUpdate`는 탄 하나마다 매 프레임 돈다. 여기서 객체를 새로 만들지 말 것.
- 태스크 수보다 **탄 수**가 비용이다. `yield 1`로 매 프레임 쏘는 루프는 금방 수천 발이 된다.

### 흔한 실수

| 증상 | 원인 |
|---|---|
| 브라우저가 멈춘다 | 루프 안에 `yield`가 없다 |
| 탄이 안 보인다 | `x`, `y`를 안 줘서 `(0,0)`에서 나가거나, `speed: 0` |
| 위로 쏜 줄 알았는데 아래로 간다 | y가 아래쪽이 양수다. 위는 `s.deg(-90)` |
| 페이즈를 넘겼는데 이전 탄이 계속 나온다 | `s.cancel(task)`를 안 했거나, 취소한 태스크가 부모가 아니다 |
| 적이 죽었는데 계속 쏜다 | `s.fork(fn)`에 owner를 안 줬다. `enemy.fork(fn)`을 쓸 것 |
| 클리어가 안 된다 | `clear: 'boss'`인데 `main`이 리턴해 버렸다 |
| 재시작하면 결과가 달라진다 | `Math.random()`이나 모듈 최상위 상태 |
| 긴 탄인데 빗나간 것 같은데 맞는다 | 판정은 원이다. `r`을 모양 길이가 아니라 폭에 맞춰야 한다 |

---

## 12. 전체 예제

### 격파형 3페이즈

```js
import { C } from '../palette.js';

export default {
  name: '예제 보스',
  clear: 'boss',
  hp: 1800,
  thresholds: [0.66, 0.33],

  *main(s) {
    const boss = s.boss;
    yield* boss.moveTo(0, s.bounds.top + boss.h / 2 - 10, 90);

    yield* phase(s, ring(s, boss));
    yield* phase(s, spiral(s, boss));
    yield* phase(s, rods(s, boss));
  },
};

function* phase(s, routine) {
  const task = s.fork(routine, s.boss);
  yield s.untilPhaseChange();
  s.cancel(task);
  s.clearBullets();
  if (s.result) return;
  yield 60;
}

function* ring(s, boss) {
  s.fork(sway(s, boss, 90, 180), boss);
  let offset = 0;
  while (true) {
    s.fireRing({ count: 24, angle: offset, x: boss.x, y: boss.y,
                 speed: 1.9, size: 3.5, r: 2.5, color: C.magenta });
    offset += s.deg(7.5);
    yield 48;
  }
}

function* spiral(s, boss) {
  let angle = 0;
  while (true) {
    for (let i = 0; i < 3; i++) {
      s.fire({ x: boss.x, y: boss.y, angle: angle + s.TAU * i / 3,
               speed: 2.6, accel: -0.012, minSpeed: 1.1, size: 3, r: 2.5, color: C.violet });
    }
    angle += s.deg(11);
    yield 3;
  }
}

function* rods(s, boss) {
  s.fork(sway(s, boss, 110, 120), boss);
  while (true) {
    const base = s.aim(boss);
    for (let i = 0; i < 3; i++) {
      s.fireFan({ count: 7, angle: base, spread: s.deg(40), x: boss.x, y: boss.y,
                  speed: 2.2 + i * 0.5, shape: 'rod', size: 5, r: 2.5, color: C.orange });
      yield 6;
    }
    yield 70;
  }
}

function* sway(s, boss, amplitude, period) {
  const baseX = boss.x, baseY = boss.y;
  let t = 0;
  while (true) {
    t++;
    boss.x = baseX + Math.sin(t / period * s.TAU) * amplitude;
    boss.y = baseY + Math.sin(t / period * s.TAU * 2) * 8;
    yield;
  }
}
```

### 버티기형

```js
import { C } from '../palette.js';

export default {
  name: '예제 생존',
  clear: 'survival',
  seconds: 40,
  thresholds: [0.66, 0.33],   // 남은 시간 비율 기준

  *main(s) {
    const core = s.boss;
    yield* core.moveTo(0, s.bounds.top + core.h / 2 - 20, 60);

    let angle = 0;
    while (true) {
      const arms = 5 + s.phase * 2;    // 임계점을 넘을 때마다 강화된다
      s.fireRing({ count: arms, angle, x: core.x, y: core.y,
                   speed: 2.4, omega: s.deg(0.35), shape: 'wedge', size: 4, r: 2.5, color: C.pink });
      angle += s.deg(13);
      yield 4;
    }
  },
};
```

---

## 13. 디버깅

- **P** 일시정지, **R** 재시작. UI 패널에 게이지·단계·프레임·탄 수·폭탄·피격·스침이 실시간으로 뜬다.
- 콘솔에서 `engine`으로 전부 만질 수 있다.

```js
engine.stage.boss.hp = 100        // 페이즈 건너뛰기
engine.stage.player.invuln = 99999 // 무적으로 관찰
engine.paused = true
engine.step()                      // 한 프레임씩 진행
engine.stage.bullets.active.length
engine.stage.scheduler.count       // 살아 있는 태스크 수 — 페이즈 전환 후 줄어드는지 확인
```

- 패턴 코드에서 난 예외는 `[danmaku] 패턴 실행 중 오류:`로 콘솔에 찍히고 그 태스크만 멈춘다.
  탄이 갑자기 안 나오면 콘솔부터 볼 것.

---

## 14. 헬퍼 (배치 · 거동 · 색)

좌표를 직접 계산하지 않고도 복잡한 탄막을 만들기 위한 도구들이다.
Danmakufu의 `ObjMove_AddPattern`(예약 변경), BulletML의 방향 타입·term 보간,
BulletPro의 배치/거동 분리를 이 엔진 형태로 옮긴 것이다.

### 14.1 발사 레이아웃

`fire*`는 전부 같은 **공통 옵션**을 받는다. 나머지 키는 그대로 탄 속성으로 넘어간다.

| 옵션 | 뜻 |
|---|---|
| `origin` / `center` | 배치 기준점. 없으면 `x`, `y`. 그것도 없으면 `(0,0)` |
| `rotation` | 배치 전체를 기준점 중심으로 회전 |
| `facing` | 각 탄의 방향: `'out'` / `'in'` / `'aim'` / `'along'`(접선) / 숫자(절대각) |
| `aimType` | `'absolute'`(기본) / `'aim'`(플레이어 기준 오프셋) / `'sequence'`(직전 발사각 기준) |
| `jitter` | 위치를 ±이만큼 흩뿌린다 |
| `ramp` | `{ speed:[a,b], size:[a,b], color:[c1,c2] 또는 (t)=>값 }` — i에 따라 배분 |
| `each` | `(bullet, i, count) => void` 생성 직후 콜백 |

```js
s.fire(opts)                                              // 1발
s.fireRing({ count, angle, radius })                      // 원형 (radius를 주면 그 반지름 위에서 생성)
s.fireFan({ count, angle, spread, radius })               // 부채꼴
s.fireLine({ from, to, count, angle })                    // 선분 위 등간격
s.fireArcAt({ radius, from, to, count })                  // 원호 위 (기본 facing: 'out')
s.firePolygon({ sides, radius, perSide, mode })           // 정다각형. mode: 'outline'(기본) | 'vertex'
s.fireStar({ points, inner, outer, perEdge })             // 별
s.fireGrid({ cols, rows, gapX, gapY })                    // 격자
s.firePath(path, { count, closed })                       // 임의 경로 위
```

전부 `Bullet[]`을 돌려준다. 한도(20000발)를 넘으면 그만큼 짧은 배열이 온다.

```js
// 사각형 윤곽으로 배치해 바깥으로 퍼뜨리고, 색은 왼쪽→오른쪽 그라데이션
s.firePolygon({
  sides: 4, radius: 70, perSide: 6, center: { x: boss.x, y: boss.y + 40 },
  rotation: s.deg(15), facing: 'out', speed: 1.5,
  ramp: { color: [s.oklch(0.8, 0.2, 20), s.oklch(0.8, 0.2, 200)] },
});
```

### 14.2 경로

경로는 `t(0~1) => {x, y}` 함수다. **배치**(`firePath`)와 **이동**(`motion: 'path'`) 양쪽에서 같은 걸 쓴다.

```js
s.pathCircle(radius, { center, from, to })
s.pathPolygon(sides, radius, { center, rotation })
s.pathStar(points, inner, outer, { center, rotation })
s.pathLine(from, to)
s.pathLissajous(a, b, { center, width, height, delta })   // a:b 비율이 무늬를 정한다
s.pathRose(k, radius, { center, rotation })               // 꽃잎 곡선
s.pathBezier(p0, p1, p2, p3)
s.pathTangent(path, t)                                    // 그 지점의 진행 방향
```

직접 만들어도 된다. `t => s.polar(t * s.TAU * 3, 60 + 40 * Math.sin(t * s.TAU * 5))`

### 14.3 거동 모듈 (`motion`)

`onUpdate` 클로저 대신 데이터로 지정한다. 탄마다 클로저를 만들지 않아 풀링에 유리하다.

| type | 파라미터 | 하는 일 |
|---|---|---|
| `wave` | `amp`, `period`, `phase` | 진행 방향 기준 좌우 사인 흔들림 |
| `orbit` | `center`, `radius`, `omega`, `radiusSpeed` | 한 점 주위 공전 (위치를 직접 잡는다) |
| `homing` | `turn`, `frames`, `target` | 목표 쪽으로 프레임당 최대 `turn`만큼 선회 |
| `path` | `path`, `frames`, `loop`, `origin`, `relative`, `ease`, `after` | 경로 따라 이동 (위치를 직접 잡는다) |
| `bounce` | `times`, `padding`, `floor` | 벽에서 튕김 |

- `center`/`target`에는 좌표 객체 외에 `'player'`, `'boss'` 문자열을 줄 수 있다.
- `orbit`은 `radius`를 생략하면 생성 위치와 중심 사이 거리를 그대로 쓴다.
- `path`는 기본이 **절대 좌표**다. 생성 위치 기준으로 쓰려면 `relative: true`, 다른 기준점은 `origin`.
- `path`가 끝나면(`loop: false`) 마지막 접선 방향으로 계속 날아간다. `after: 'vanish'`면 사라진다.

```js
const tri = s.pathPolygon(3, 110, { center: { x: 0, y: 0 } });
s.firePath(tri, {
  count: 12, facing: 'along', speed: 0,
  motion: { type: 'path', path: tri, frames: 240, loop: true },   // 삼각형 궤도를 계속 돈다
});
```

### 14.4 예약 변경 (`plan`) 과 등장 지연 (`delay`)

```js
s.fireRing({
  count: 20, radius: 20, center: boss, facing: 'out', speed: 2.4,
  delay: 24,                                   // 24프레임 예고 후 등장
  plan: [
    { at: 70,  speed: 0, over: 20 },           // 20프레임에 걸쳐 정지
    { at: 110, angle: 'aim', speed: 3.4, over: 12, ease: 'out' },  // 재조준 후 발사
  ],
});
```

- `at`은 탄의 **나이(age)** 기준. 목록은 `at` 오름차순이어야 한다.
- `over`를 주면 그 프레임 동안 보간(BulletML의 term), 없으면 즉시. `ease`로 곡선 지정.
- 값에 `'aim'`(플레이어 방향)이나 `(bullet, stage) => 값` 함수를 줄 수 있다.
- `{ at: 120, vanish: true }`로 소멸시킬 수 있다.
- 보간 가능한 필드: `speed` `angle` `omega` `accel` `size` `r`. 나머지(`color`, `shape` …)는 즉시 적용된다.
- `delay` 동안 탄은 움직이지 않고 **판정도 없다**. 예고 원이 조여드는 표시가 뜬다.

### 14.5 그룹

```js
const g = s.group(s.fireFan({ ... }));
yield 45;
g.changeAngle(a => a + s.deg(60), 30, 'inOut');   // 30프레임에 걸쳐 꺾기
g.changeSpeed(3.4, 30);
g.changeSize(5, 20);
g.set({ color: C.cyan, bombProof: true });
g.colorBy(t => s.rainbow(t));                     // t는 0~1 (배열 순서)
g.plan([{ at: 200, vanish: true }]);
g.each((b, i, n) => { b.data = i; });
g.alive                                           // 살아 있는 탄 수
g.vanish();
```

`changeSpeed`/`changeAngle`의 첫 인자에는 숫자 또는 `(현재값, bullet, i, n) => 숫자`를 줄 수 있고,
프레임을 `0`으로 두면 즉시 적용된다. 각도는 항상 최단 회전 방향으로 보간된다.

### 14.6 좌표 · 난수

```js
s.polar(angle, dist, origin?)      s.dist(a, b)
s.wrapAngle(a)                     s.angleDiff(from, to)
s.approach(cur, target, maxStep)   s.approachAngle(cur, target, maxStep)
s.rotateAround(point, center, angle)
s.lerp(a, b, t)                    s.clamp(v, lo, hi)
s.ease.linear / in / out / inOut / inCubic / outCubic / sine / back

s.randCircle(radius, origin?)      // 원 안 균일 분포
s.randEdge(margin?)                // 필드 가장자리의 임의 점
s.randSign()                       s.randAngle()
s.shuffle(arr)                     s.weighted([[값, 가중치], ...])
```

### 14.7 색과 그라데이션

```js
s.hsv(h, s, v)          // h: 0~360도, s·v: 0~1
s.hsl(h, s, l)
s.oklch(l, c, h)        // l: 밝기 0~1, c: 채도 0~0.37, h: 색상 0~360
s.mix(a, b, t)          // OKLab에서 섞는다
s.gradient([c1, c2, ...])  // t => 색 (결과는 캐시된다)
s.hueShift(color, deg)  // 밝기·채도 유지하고 색상만 회전
s.lightenColor(color, amount)   // -1 ~ 1
s.rainbow(t, { l, c })  // 무지개 한 바퀴
```

**그라데이션에는 `oklch`를 쓰는 게 좋다.** HSV는 색상만 돌려도 밝기가 들쭉날쭉해서
(같은 `v`여도 노랑은 튀고 파랑은 가라앉는다) 띠가 얼룩진다. OKLCH/OKLab은 지각 밝기가 균일해서
같은 `l`이면 어느 색상이든 비슷한 밝기로 보인다. `mix`와 `gradient`도 OKLab에서 섞는다.
탄에는 `l: 0.75~0.88`, `c: 0.15~0.22` 범위가 잘 보인다.

```js
ramp: { color: [s.oklch(0.85, 0.2, 20), s.oklch(0.85, 0.2, 200)] }   // 밝기가 고른 띠
ramp: { color: (t) => s.rainbow(t) }                                  // 무지개
```

### 14.8 태스크 조합기

```js
const t = s.every(20, (i) => { s.fireRing({ ... }); }, 10);  // 20프레임마다 10번 (생략 시 무한)
s.after(60, () => s.bomb());                                  // 60프레임 뒤 한 번
s.burst({ count: 5, gap: 6, fn: () => s.fireFan({ ... }) });   // 연사
s.ramp(0, 360, 120, (v) => { boss.data = v; }, 'inOut');       // 값 보간하며 매 프레임
s.times(5, (i) => s.fire({ angle: s.deg(i * 20) }));           // 즉시 n번 반복
yield* s.parallel(a(s), b(s));                                 // 둘 다 끝날 때까지
yield* s.sequence(a(s), b(s));                                 // 차례로
```

`every` / `after` / `burst` / `ramp`는 태스크를 만들어 돌려주므로 `s.cancel(t)`로 멈추거나
`yield s.join(t)`로 기다릴 수 있다. `fn`이 `false`를 돌려주면 `every`는 거기서 멈춘다.

전부 쓰는 예시는 [`src/patterns/helpers.js`](../src/patterns/helpers.js) (`?p=./patterns/helpers.js`)에 있다.
