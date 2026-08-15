># 헬퍼 확장 제안 (설계안, 미구현)

다른 탄막 엔진들이 무엇을 기본으로 제공하는지 조사하고, 그 중 이 시뮬레이터에 넣을 만한 것을 추린 문서다.
**아직 구현하지 않았다.** 어디까지 넣을지 정하고 나서 작업한다.

---

## 1. 다른 엔진들이 제공하는 것

| 엔진 | 핵심 개념 | 참고할 점 |
|---|---|---|
| **Danmakufu ph3** (동방 팬게임 표준) | 오브젝트 + 이동 함수. `ObjMove_SetDestAtFrame/Speed/Weight`, `ObjMove_AddPatternA2(obj, frame, speed, angle, accel, angularVelocity, maxSpeed)`, `ObjMove_SetAngularVelocity` | ① **예약 변경**: "N프레임 뒤에 속도/각도/가속도/각속도를 이걸로 바꿔라"를 탄에 미리 심어 둔다. ② `NO_CHANGE` 상수로 바꿀 항목만 지정. ③ 목적지 기반 이동 3종(프레임 지정 / 속도 지정 / 관성 지정) |
| **BulletML** (선언형 XML 표준) | `action` 안에 `fire / changeDirection / changeSpeed / accel / wait / vanish / repeat` | ① **방향 지정 타입 4종**: `aim`(플레이어 기준) `absolute`(절대) `relative`(자기 진행방향 기준) `sequence`(직전 발사 기준). ② `changeSpeed/changeDirection`은 **term(프레임) 동안 보간**된다. ③ `vanish`로 탄 스스로 소멸. ④ 라벨 + `param`으로 패턴 재사용 |
| **BulletPro** (Unity) | Shot(배치) / Bullet(거동) / Pattern(명령열) 3층 분리 | ① **배치(layout)와 거동(behaviour)을 분리**한다. 배치: circle / line / spiral / arc, radius, spacing, spread, **rotate around pivot**. ② 거동 모듈: 시간에 따른 커브, 호밍, 파동(sine), **궤도(orbit)**, 지연 스폰 |
| **BulletFury** (Unity) | 스폰 셰이프 + 모듈 | 스폰 시 위치·방향을 바꾸는 모듈을 쌓는 구조, 벽 반사(bounce) |
| **LuaSTG** | 코루틴 태스크 + `Wait(frames)` | 우리 스케줄러와 같은 모델. 이미 갖춤 |

**공통 결론 3가지**

1. 거의 모든 엔진이 **발사 위치 배치**와 **발사 방향**을 따로 다룬다. 우리는 지금 방향만 있고 위치는 `x`, `y`를 직접 계산해야 한다 — 이게 지금 제일 큰 구멍이다.
2. 탄의 시간에 따른 변화를 **선언적으로** 준다(BulletML의 term 보간, Danmakufu의 AddPattern 예약). 우리는 `onUpdate` 클로저로 매번 손으로 짠다.
3. 좌표 회전(피벗 기준), 극좌표, 각도 보간 같은 **수학 유틸**은 어디나 기본 제공한다. 우리는 없다.

---

## 2. 제안: 티어 1 — 좌표·배치·조합 (효과 대비 가장 싸다)

### 2.1 수학 유틸

```js
s.polar(angle, dist, origin?)      // {x, y}. origin 생략 시 (0,0)
s.dist(a, b)
s.wrapAngle(a)                     // -PI..PI로 정규화
s.angleDiff(from, to)              // 최단 회전 방향의 차이
s.approach(cur, target, maxStep)   // 한 스텝만큼 다가간 값
s.rotateAround(point, center, angle)
s.lerp(a, b, t), s.clamp(v, lo, hi)
s.ease.in / out / inOut / bounce   // 0..1 -> 0..1
```

### 2.2 난수

```js
s.randCircle(radius, origin?)   // 원 안 균일 분포 점
s.randEdge(margin?)             // 필드 가장자리의 임의 점
s.randSign()                    // -1 또는 1
s.randAngle()
s.shuffle(arr)                  // 시드 고정
s.weighted([[값, 가중치], ...])
```

### 2.3 발사 레이아웃 — **위치 배치**

지금 `fireRing`/`fireFan`은 *방향*만 나눈다. 여기에 *위치*를 나누는 함수를 추가한다.
전부 `Bullet[]`을 돌려주고, 아래 **공통 옵션**을 받는다.

| 공통 옵션 | 뜻 |
|---|---|
| `origin: {x, y}` | 배치의 기준점 (기본 `(0,0)`) |
| `rotation` | 배치 전체를 기준점 중심으로 회전 (BulletPro의 rotate around pivot) |
| `facing` | 각 탄이 향할 방향: `'out'` / `'in'` / `'aim'` / `'along'`(경로 접선) / 숫자(절대각) |
| `radius` | 기준점에서 이만큼 떨어진 자리에서 생성 (0이면 한 점에서) |
| `jitter` | 위치·각도에 줄 흔들림 폭 |
| `ramp: {speed:[a,b], size:[a,b]}` | i번째 탄에 값을 선형 배분 |
| `each(bullet, i, count)` | 생성 직후 콜백 (미세 조정용) |

```js
s.fireLine({ from, to, count, ...탄속성 })              // 선분 위 등간격
s.firePolygon({ sides, radius, perSide, center,        // 정다각형 윤곽
                rotation, mode: 'outline'|'vertex' })
s.fireStar({ points, inner, outer, perEdge })
s.firePath(t => ({x, y}), { count })                   // 임의 파라메트릭 곡선 (t: 0..1)
s.fireGrid({ cols, rows, gapX, gapY, center })
s.fireArcAt({ center, radius, from, to, count })       // 원호 위 배치
```

`firePath`가 있으면 리사주·장미곡선·하트 같은 건 패턴 파일 쪽에서 한 줄로 만들 수 있다.

```js
s.firePath(t => s.polar(t * s.TAU * 3, 60 + 40 * Math.sin(t * s.TAU * 5)), { count: 120, facing: 'out', speed: 1.4 });
```

### 2.4 조준 타입 (BulletML)

```js
s.fire({ ..., aimType: 'absolute' })  // 기본
s.fire({ ..., aimType: 'aim' })       // angle을 플레이어 기준 오프셋으로 해석
s.fire({ ..., aimType: 'sequence' })  // 직전 발사각 기준 오프셋
```

지금도 `angle: s.aim(boss) + s.deg(10)`으로 되지만, 링/부채/다각형에 섞어 쓸 때 매번 계산이 번거롭다.

### 2.5 태스크 조합기

```js
s.every(interval, fn, times?)    // interval마다 fn 실행하는 태스크 (반환: task)
s.after(frames, fn)              // frames 뒤 한 번
s.times(n, fn)                   // n번 즉시 반복 (yield 없음)
s.ramp(from, to, frames, fn, ease?)   // 값 보간하며 매 프레임 fn(v, t)
s.burst({ count, gap, fn })      // gap 간격으로 count번 (연사)
s.parallel(...gens)              // 전부 끝날 때까지
s.sequence(...gens)              // 차례로
```

`s.every(20, () => s.fireRing({...}))` 한 줄이 지금은 5줄짜리 제너레이터다.

### 2.6 탄 그룹

`fire*`가 돌려주는 배열을 감싸서 나중에 한꺼번에 조작한다.

```js
const g = s.group(s.fireRing({ ... }));
g.each((b, i) => { b.data = i; });
g.changeAngle(a => a + s.deg(90), 30);  // 30프레임에 걸쳐
g.changeSpeed(4, 20);
g.setColor(C.cyan);
g.vanish();          // 전부 소멸
g.alive               // 살아 있는 탄 수
```

---

## 3. 티어 2 — 탄 거동 (모션 모듈)

`onUpdate` 클로저를 직접 안 써도 되게, 자주 쓰는 거동을 **데이터로** 준다.
(클로저를 매 탄마다 만들면 풀링 이점이 줄어든다. 모듈은 파라미터만 저장하고 로직은 공유한다.)

```js
s.fire({ ..., motion: { type: 'wave',  amp: 24, period: 40 } })       // 진행방향 기준 좌우 사인 흔들림
s.fire({ ..., motion: { type: 'orbit', center, radius, omega } })      // 한 점 주위 공전 ★
s.fire({ ..., motion: { type: 'homing', turn: 0.02, frames: 120 } })   // 유도
s.fire({ ..., motion: { type: 'path', path, frames, loop } })          // 경로 따라 이동 ★
s.fire({ ..., motion: { type: 'bounce', times: 3 } })                  // 벽 반사
s.fire({ ..., motion: { type: 'spiralOut', omega, accel } })
```

★ 표시가 "특정 점 기준 회전", "다각형 모양을 이루며 이동"에 해당한다.
`path`에 `s.polygonPath(sides, radius, center)`를 주면 다각형 궤도를 돈다.

### 예약 변경 (Danmakufu `AddPatternA2` + BulletML `changeSpeed`)

```js
s.plan(bullet, [
  { at: 60,  speed: 0 },                       // 60프레임에 정지
  { at: 90,  angle: 'aim', speed: 3.5 },       // 90프레임에 재조준 후 발사
  { at: 120, omega: s.deg(2), over: 30 },      // 30프레임에 걸쳐 각속도 부여
]);
```

- `at`은 탄의 나이(age) 기준.
- `over`를 주면 그 프레임 수 동안 **보간**(BulletML의 term), 없으면 즉시.
- 안 적은 항목은 그대로 둔다(`NO_CHANGE`와 같은 취급).

### 등장 지연 (Danmakufu shot delay)

```js
s.fire({ ..., delay: 20 })   // 20프레임 동안 판정 없이 예고 표시만, 이후 실제 발사
```

밀도 높은 패턴에서 "어디서 나올지"를 미리 보여주는 표준 장치다.

---

## 4. 티어 3 — 발사대와 레이저

### 가상 발사대 (emitter)

보스와 별개로 움직이는 발사 원점. 이게 있으면 "회전하는 팔 끝에서 탄이 나온다" 같은 게 쉬워진다.

```js
const arm = s.emitter({ x: 0, y: -120, angle: 0 });
arm.orbit({ x: 0, y: -120 }, 80, s.deg(1.5));   // 공전
arm.moveAlong(path, 180);
s.every(6, () => s.fireFan({ count: 3, origin: arm, angle: arm.angle, spread: s.deg(20) }));
```

### 레이저

판정 코드를 손봐야 해서 별도 티어다.

- `straight`: 선분-원 판정. 발사 전 **예고선**(가늘고 반투명) → 발사 상태 전환
- `curve`: 탄의 궤적을 폴리라인으로 남기는 곡선 레이저
- `laser.on/off`, 폭 애니메이션

### 적 이동 보강 (Danmakufu 목적지 3종)

```js
yield* e.moveToSpeed(x, y, speed)             // 등속으로 도착
yield* e.moveToWeight(x, y, weight, maxSpeed) // 관성 있게 도착 (가장 자연스러움)
yield* e.moveAlong(path, frames)
e.wander({ margin, speed })                   // 필드 안 랜덤 배회
```

---

## 5. 지켜야 할 제약

- **결정성**: 모든 헬퍼는 `s.rng`만 쓴다. `Math.random`·시간 함수 금지.
- **풀링**: 모션 모듈은 파라미터 객체만 갖고, 실행 함수는 타입별로 하나씩 공유한다. 탄마다 클로저를 만들지 않는다.
- **판정은 원**: 레이저를 넣기 전까지는 어떤 모양이든 판정이 원이라는 규칙을 유지한다.
- **로컬 파일 패턴**: 상대 import를 못 하므로, 헬퍼는 전부 `s.*`에 붙여야 한다. 별도 모듈로 빼면 로컬 파일에서 못 쓴다.
- **하위 호환**: 기존 `fire`/`fireRing`/`fireFan` 시그니처는 그대로 두고 옵션만 추가한다.

---

## 6. 우선순위 추천

| 티어 | 내용 | 왜 |
|---|---|---|
| **1-A** | 수학·난수 유틸, `fire*` 공통 옵션(`origin`, `radius`, `rotation`, `facing`, `ramp`) | 다른 모든 헬퍼의 토대. 이것만으로도 좌표 직접 계산이 대부분 사라진다 |
| **1-B** | `fireLine` / `firePolygon` / `firePath` / `fireArcAt`, 태스크 조합기(`every`/`after`/`ramp`/`burst`) | 요청한 "다각형 배치"가 여기서 해결된다 |
| **2-A** | `motion` 모듈 (`orbit`, `path`, `wave`, `homing`, `bounce`) | 요청한 "특정 점 기준 회전", "다각형 궤도"가 여기서 해결된다 |
| **2-B** | `s.plan` 예약 변경 + `group.changeSpeed/changeAngle` 보간 + `delay` 등장 | 다단 변화 패턴이 가능해진다 |
| **3** | emitter, 레이저, 적 이동 보강 | 판정·렌더 변경이 필요해 비용이 크다 |

---

## 참고 자료

- [Touhou Danmakufu ph3 함수 목록 (Touhou Wiki)](https://en.touhouwiki.net/wiki/Touhou_Danmakufu/Functions_(ph3))
- [Sparen's Danmakufu ph3 Tutorials — Lesson 7 (보스 이동·발사)](https://sparen.github.io/ph3tutorials/ph3u1l7.html)
- [Sparen's Danmakufu ph3 Tutorials — Lesson 10 (AddPatternA2, 각속도·가속도)](https://sparen.github.io/ph3tutorials/ph3u1l10.html)
- [BulletML Reference (원 명세)](http://www.asahi-net.or.jp/~cs8k-cyu/bulletml/bulletml_ref_e.html)
- [BulletML Reference (Noxalus 정리)](https://github.com/Noxalus/BulletML/wiki/BulletML-Reference)
- [BulletPro 매뉴얼 (PDF)](https://ominouslab.com/media/BulletPro_Manual.pdf)
- [BulletFury (Unity Asset Store)](https://assetstore.unity.com/packages/tools/particles-effects/bulletfury-optimised-bullet-spawning-199208)
- [LuaSTG Wiki — Wait (코루틴 태스크 모델)](https://en.luastg.shoutwiki.com/wiki/Wait)
