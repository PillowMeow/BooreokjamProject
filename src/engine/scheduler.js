// 제너레이터 기반 코루틴 스케줄러.
//
// 태스크는 제너레이터 하나이고, 매 프레임 한 번씩 재개된다.
//   yield             -> 1프레임 대기
//   yield n           -> n프레임 대기 (최소 1)
//   yield () => bool  -> 조건이 참이 되는 프레임까지 대기
//   yield* other()    -> 다른 제너레이터에 위임 (JS 기본 동작, 스케줄러가 신경 쓸 것 없음)
//
// owner를 주면 그 객체의 alive가 false가 되는 순간 태스크도 같이 끝난다.
// (적이 죽었는데 발사 루프만 계속 도는 사고 방지)

export class Scheduler {
  constructor() {
    this.tasks = [];
    this.pending = [];
    this.current = null;   // 지금 재개 중인 태스크 (fork의 부모가 된다)
  }

  /**
   * @param {Generator} gen 실행할 제너레이터
   * @param {{alive: boolean}} [owner] 이 객체가 죽으면 태스크도 종료
   */
  add(gen, owner = null) {
    const task = {
      gen,
      owner,
      wait: 0,
      until: null,
      done: false,
      parent: this.current,
      children: [],
    };
    if (this.current) this.current.children.push(task);
    // update 도중에 추가된 태스크는 다음 프레임부터 돈다.
    this.pending.push(task);
    return task;
  }

  /** 태스크와 그 태스크가 fork한 하위 태스크를 전부 종료한다. */
  cancel(task) {
    if (!task || task.done) return;
    task.done = true;
    for (const child of task.children) this.cancel(child);
    task.children.length = 0;
  }

  clear() {
    this.tasks.length = 0;
    this.pending.length = 0;
  }

  get count() {
    return this.tasks.length + this.pending.length;
  }

  update() {
    if (this.pending.length) {
      for (const t of this.pending) this.tasks.push(t);
      this.pending.length = 0;
    }

    let alive = 0;
    for (let i = 0; i < this.tasks.length; i++) {
      const task = this.tasks[i];
      this.step(task);
      if (!task.done) this.tasks[alive++] = task;
    }
    this.tasks.length = alive;
  }

  step(task) {
    if (task.done) return;
    if (task.owner && !task.owner.alive) {
      task.done = true;
      return;
    }

    if (task.until) {
      if (!task.until()) return;
      task.until = null;
    } else if (task.wait > 0) {
      task.wait--;
      return;
    }

    let result;
    const prev = this.current;
    this.current = task;
    try {
      result = task.gen.next();
    } catch (err) {
      console.error('[danmaku] 패턴 실행 중 오류:', err);
      task.done = true;
      return;
    } finally {
      this.current = prev;
    }

    if (result.done) {
      task.done = true;
      return;
    }

    const value = result.value;
    if (typeof value === 'number') {
      // yield n = n프레임 뒤 재개. 이 프레임은 이미 소비했으므로 n-1을 남긴다.
      task.wait = Math.max(0, Math.floor(value) - 1);
    } else if (typeof value === 'function') {
      task.until = value;
    } else {
      task.wait = 0; // yield 단독 = 다음 프레임
    }
  }
}
