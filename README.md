# BOOREOKJAM PROJECT

## 조작

| 키 | 동작 |
|---|---|
| 방향키 / WASD | 이동 |
| Shift | 저속 이동 (판정점이 흰색으로 바뀜) |
| Z / Space | 발사 |
| X | 폭탄 |
| R | 재시작 |
| P | 일시정지 |

**폭탄**은 화면의 적탄을 전부 지우고 1초(60프레임) 무적을 준다. `bombProof: true`인 탄은 지워지지 않는다.
개수 제한은 없고, 사용 횟수만 결과에 기록된다.
**사망**하면 화면이 잠깐 흔들리면서 같은 폭탄 효과가 걸리고(사용 횟수에는 안 들어감) 무적 2초를 받는다.

## 탄막 파일 작성

> 아래는 요약이다. 전체 명세(실행 모델, API 레퍼런스, 관용구, 흔한 실수, 디버깅)는
> **[docs/patterns.md](docs/patterns.md)**에 있다.


```js
export default {
  name: '패턴 이름',

  clear: 'boss',              // 'boss' = 보스를 잡으면 클리어 / 'survival' = 시간을 버티면 클리어
  hp: 1800,                   // clear: 'boss' 일 때 보스 체력
  seconds: 40,                // clear: 'survival' 일 때 버틸 시간(초)
  thresholds: [0.66, 0.33],   // 임계점. 넘을 때마다 s.phase가 1 오르고 보스바에 눈금이 찍힌다.
  sprite: './sprites/boss.png', // 선택. 기본값이 이것.
  spriteScale: 0.21,          // 선택. 생략하면 세로 54px에 맞춰 자동으로 줄인다.

  init(s) {},                 // 선택. 시작 전 1회.
  *main(s) {},                // 필수. 제너레이터.
};
```

**보스는 엔진이 만든다.** 패턴은 `s.boss`로 받아서 움직이고 쏘기만 하면 된다.
보스 히트박스는 그려지는 스프라이트 사각형 그대로다 (`boss.w` × `boss.h`).
`spriteScale`을 생략하면 **세로 54px**(스프라이트 도입 전 원형 보스 지름 36px의 1.5배)에 맞춰 자동으로 축소한다.
`sprites/boss.png`(448×256)는 이 규칙으로 94.5 × 54가 된다. 크기를 직접 정하려면 `spriteScale`을 주면 되고, 히트박스도 같이 변한다.
기준값은 [`stage.js`](src/engine/stage.js)의 `BOSS_HEIGHT` 한 줄이다.

`clear: 'survival'`이면 보스는 무적이 되고 보스바가 **파란색**으로 남은 시간을 센다.
`clear: 'boss'`면 **빨간색**으로 보스 체력을 표시한다. 어느 쪽이든 클리어하면
소요 시간 / 폭탄 / 사망 / 그레이즈 비율이 화면 중앙에 뜬다 (그레이즈 비율 = 스친 탄 ÷ 발사된 총 탄).

### 임계점 쓰기

`thresholds`는 게이지 비율(0~1) 배열이고, `1`보다 큰 값을 주면 절대 체력/초로 보고 알아서 비율로 바꾼다
(`hp: 1800` 에 `thresholds: [1200, 600]` = `[0.66, 0.33]`).
현재 구간은 `s.phase` (0부터), 다음 임계점까지 기다리는 건 `yield s.untilPhaseChange()`다.

```js
*main(s) {
  yield* phase(s, ringBurst(s, s.boss));   // 0.66 넘을 때까지
  yield* phase(s, spiralArms(s, s.boss));  // 0.33 넘을 때까지
  yield* phase(s, aimedRain(s, s.boss));   // 격파할 때까지
}
function* phase(s, routine) {
  const task = s.fork(routine, s.boss);
  yield s.untilPhaseChange();
  s.cancel(task);          // 이 루틴이 fork한 하위 태스크까지 같이 정리된다
  s.clearBullets();
}
```

임계점을 페이즈 전환이 아니라 강화에 쓸 수도 있다 (`const arms = 5 + s.phase * 2`, [spiral.js](src/patterns/spiral.js) 참고).

### 좌표계

필드는 384×448이고 **중앙이 (0, 0)**, x는 오른쪽, y는 **아래쪽**이 양수다.
각도는 라디안이고 `0`이 오른쪽(+x), 값이 커지면 화면상 시계 방향이다.
속도 단위는 **프레임당 픽셀** (60fps 기준, `speed: 3` = 초당 180px).

### yield 규칙

```js
yield;                        // 1프레임
yield 30;                     // 30프레임 (= yield s.wait(30))
yield s.until(() => boss.hp < 500);   // 조건이 참이 될 때까지
yield s.untilGauge(0.5);      // 게이지가 절반 이하가 될 때까지
yield s.untilPhaseChange();   // 다음 임계점을 넘을 때까지
yield s.join(task);           // 그 태스크가 끝날 때까지
yield* other(s);              // 다른 제너레이터에 위임
```

### Stage API

```js
// 발사
s.fire({ x, y, angle, speed, ... })          // 탄 1개, Bullet을 돌려준다
s.fireRing({ count, angle, ...탄속성 })       // 원형 일제사
s.fireFan({ count, angle, spread, ...탄속성 }) // 부채꼴
s.clearBullets()                              // 전멸 (bombProof 포함)
s.clearBombable()                             // 폭탄과 같은 판정으로 제거
s.bomb()                                      // 폭탄 효과 + 사용 횟수 +1

// 보스 / 적
s.boss                                        // 엔진이 만든 보스
const e = s.spawn({ x, y, hp, r, color, invuln, onDeath })   // 잡몹 (원형 판정)
e.damage(n, s); e.kill(s)
yield* e.moveTo(x, y, frames)                 // 부드럽게 이동
e.fork(genFn)                                 // 이 적이 죽으면 같이 끝나는 태스크

// 병렬 태스크
const t = s.fork(routine(s, boss), boss)      // 두 번째 인자는 owner(선택)
s.cancel(t)                                   // 하위 fork까지 함께 종료

// 조회
s.px, s.py           // 플레이어 좌표
s.aim(from)          // from에서 플레이어를 향하는 각도
s.angleTo(from, to)
s.gauge              // 보스바 값 1 -> 0
s.phase              // 통과한 임계점 수
s.remaining          // survival 모드 남은 시간(초)
s.frame              // 경과 프레임
s.bounds             // { left, right, top, bottom }
s.deg(90)            // 도 -> 라디안
s.rand(a, b), s.randInt(a, b), s.pick(arr)    // 시드 고정 난수
```

### 헬퍼

좌표를 직접 계산하지 않고도 복잡한 배치·거동을 만들 수 있다. 자세한 건 [docs/patterns.md §14](docs/patterns.md).

```js
// 배치 — 공통 옵션: origin, rotation, facing('out'|'in'|'aim'|'along'|각도), aimType, jitter, ramp, each
s.fireLine({ from, to, count })          s.firePolygon({ sides, radius, perSide, mode })
s.fireStar({ points, inner, outer })     s.fireGrid({ cols, rows, gapX, gapY })
s.fireArcAt({ radius, from, to, count }) s.firePath(path, { count })

// 경로 (배치와 이동 양쪽에서 쓴다)
s.pathPolygon(sides, radius, { center })  s.pathCircle(r)  s.pathLissajous(a, b)
s.pathRose(k, r)  s.pathStar(...)  s.pathBezier(...)  s.pathLine(a, b)

// 거동 — onUpdate 없이 데이터로 지정
motion: { type: 'orbit', center, omega }     // 한 점 주위 공전
motion: { type: 'path', path, frames, loop } // 경로를 따라 이동
motion: { type: 'wave' | 'homing' | 'bounce', ... }

// 예약 변경 + 등장 지연
delay: 24,
plan: [{ at: 70, speed: 0, over: 20 }, { at: 110, angle: 'aim', speed: 3.4 }]

// 그룹
const g = s.group(s.fireFan({ ... }));
g.changeAngle(a => a + s.deg(60), 30);  g.colorBy(t => s.rainbow(t));  g.vanish();

// 색 — 그라데이션은 oklch 권장 (밝기가 고르다)
s.oklch(l, c, h)  s.hsv(h, s, v)  s.mix(a, b, t)  s.gradient([...])  s.rainbow(t)

// 태스크
s.every(20, fn, times)  s.after(60, fn)  s.burst({ count, gap, fn })  s.ramp(0, 1, 60, fn)
```

### 탄 속성

| 필드 | 뜻 | 기본값 |
|---|---|---|
| `x`, `y` | 위치 | 0, 0 |
| `angle` | 진행 방향 (라디안) | 0 |
| `speed` | 프레임당 픽셀 | 0 |
| `accel` | 프레임당 속도 증감 | 0 |
| `omega` | 프레임당 각도 증감 (휘는 탄) | 0 |
| `minSpeed`, `maxSpeed` | accel 적용 시 속도 한계 | ±∞ |
| `r` | 판정 반지름 | 2.5 |
| `shape` | `circle` / `orb` / `wedge` / `rod` | `circle` |
| `size` | 그리기 크기 (모양별 해석은 아래) | 3 |
| `color` | CSS 색 | `#ff5577` |
| `life` | 수명 프레임 (0이면 무제한) | 0 |
| `bombProof` | 폭탄·사망 효과로 안 지워짐 | `false` |
| `onUpdate` | `(bullet, stage) => void`, 매 프레임 | `null` |
| `data` | 패턴이 자유롭게 쓰는 칸 | `null` |

탄은 필드 밖으로 48px 이상 나가면 자동으로 사라진다.
`onUpdate` 안에서 `b.alive = false`로 직접 지울 수도 있다.

### 탄 모양

`size`의 해석이 모양마다 다르고, `wedge`/`rod`는 `angle`을 따라 회전한다.
판정(`r`)은 항상 원이므로 긴 모양은 `r`을 따로 잡아 주는 게 좋다.

| shape | 생김새 | `size` | 어울리는 `r` |
|---|---|---|---|
| `circle` | 동그란 탄 | 반지름 | `size - 0.5` |
| `orb` | 커다란 동그라미 (옅은 후광) | 반지름 | `size - 2` |
| `wedge` | 삼각형, 진행 방향을 향함 | 길이 = `size × 2.2` | `size × 0.6` |
| `rod` | 얇은 막대 | 길이 = `size × 3.6`, 폭 = `size × 0.5` | `size × 0.5` |

`?p=./patterns/shapes.js`가 네 모양을 차례로 쏘는 확인용 패턴이다.

### 탄 색

색은 [`src/palette.js`](src/palette.js)의 `C`를 쓴다 (`import { C } from '../palette.js'`, 또는 import 없이 `s.C`).
배경이 검은색이라 어두운 색은 묻히므로 **전부 밝은 색(휘도 0.5 이상)만** 모아 뒀다.

속심은 흰색이나 검은색이 아니라 **그 색을 흰색 쪽으로 75% 끌어올린 밝은 색**이다
(노랑 `#ffe95c` → 속심 `rgb(255,250,214)`). 색조가 남아서 무슨 탄인지 구분되면서 가운데가 뜬다.
비율은 [`render.js`](src/engine/render.js)의 `CORE_LIGHTEN` 한 줄이다.
겹친 탄끼리 구분되도록 아주 얇은(1px) 어두운 윤곽선도 두른다. 새 색을 추가할 때 어두운 색은 피하는 게 좋다.
로컬 파일로 불러오는 패턴은 상대 import를 못 쓰므로 `s.C.cyan`처럼 쓰면 된다.

## 구조

| 파일 | 역할 |
|---|---|
| `src/main.js` | `?p=`로 지정된 패턴을 import 하고 엔진 시작 |
| `src/ui.js` | 우측 상단 패널 (선택 / 파일 열기 / 재시작 / 일시정지 / 상태) |
| `src/patterns/index.js` | UI 드롭다운에 뜨는 내장 탄막 목록 |
| `src/engine/engine.js` | 고정 60fps 루프, 재시작/일시정지 |
| `src/engine/stage.js` | 한 판의 상태 전부 + 패턴이 쓰는 API + 클리어 판정 |
| `src/engine/scheduler.js` | 제너레이터 코루틴 (부모-자식 취소 포함) |
| `src/engine/bullets.js` | 탄 풀, 이동, 화면 밖 제거 |
| `src/engine/player.js` | 이동, 저속, 샷, 피격/무적 |
| `src/engine/enemy.js` | HP, 원/사각 판정, `moveTo` |
| `src/engine/layout.js` | 발사 배치(다각형·선·경로 등) 좌표 생성 |
| `src/engine/motion.js` | 탄 거동 모듈, 예약 변경(plan), 값 보간(tween) |
| `src/engine/mathx.js` | 좌표·각도·이징·경로 생성기 |
| `src/engine/color.js` | HSV / OKLCH, 그라데이션 |
| `src/engine/group.js` | 발사한 탄 묶음을 나중에 조작 |
| `src/engine/assets.js` | 스프라이트 로딩 |
| `src/engine/render.js` | 캔버스 그리기 — 격자 배경, 탄 모양, 보스 게이지, 화면 흔들림, 결과 |
| `src/engine/input.js` | 키 상태 |
| `src/engine/rng.js` | 시드 고정 난수 |
| `src/engine/config.js` | 필드 크기, fps, 상한 |
