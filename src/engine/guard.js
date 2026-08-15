// 패턴이 없는 함수를 부르면 (예: s.angle(20)) 조용히 죽는 대신
// "s.angle 은 없습니다. s.deg 를 찾으셨나요?" 처럼 알려 준다.
//
// 패턴에 건네주는 s 만 이 Proxy로 감싼다. 엔진 내부는 그대로다.

/** 두 이름이 얼마나 비슷한지 (편집 거리) */
function distance(a, b) {
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/** 이름이 비슷한 것 최대 3개 */
function suggest(name, candidates) {
  const lower = name.toLowerCase();
  return candidates
    .map((c) => {
      const cl = c.toLowerCase();
      // 앞부분이 겹치거나 포함되면 가산점
      const bonus = cl.startsWith(lower) || lower.startsWith(cl) || cl.includes(lower) ? -2 : 0;
      return { c, d: distance(lower, cl) + bonus };
    })
    .filter((x) => x.d <= 4)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.c);
}

export function guardStage(stage) {
  const names = [];
  for (let o = stage; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    for (const k of Object.getOwnPropertyNames(o)) {
      if (k !== 'constructor' && !k.startsWith('_') && !names.includes(k)) names.push(k);
    }
  }

  return new Proxy(stage, {
    get(target, key) {
      if (typeof key === 'symbol' || key in target) return target[key];

      const hint = suggest(String(key), names);
      const tail = hint.length
        ? `\n  혹시 이걸 찾으셨나요?  ${hint.map((h) => `s.${h}`).join('  ')}`
        : '\n  쓸 수 있는 것 전부 보기:  engine.stage.help()';
      throw new TypeError(`s.${String(key)} 는 없는 기능입니다.${tail}`);
    },
  });
}
