// 키 상태만 들고 있는 얇은 래퍼. 방향키 / Shift(저속) / Z(샷) / R(재시작) / P(일시정지).

const KEY_MAP = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
  ShiftLeft: 'focus',
  ShiftRight: 'focus',
  KeyZ: 'shoot',
  Space: 'shoot',
};

const EDGE_KEYS = {
  KeyX: 'bomb',
  KeyR: 'restart',
  KeyP: 'pause',
};

export class Input {
  constructor(target = window) {
    this.left = false;
    this.right = false;
    this.up = false;
    this.down = false;
    this.focus = false;
    this.shoot = false;

    this.edges = new Set();   // 이번 프레임에 새로 눌린 액션
    this._pressed = new Set();

    target.addEventListener('keydown', (e) => this.onKey(e, true));
    target.addEventListener('keyup', (e) => this.onKey(e, false));
    target.addEventListener('blur', () => this.releaseAll());
  }

  onKey(e, down) {
    // UI 요소에 포커스가 가 있으면 게임 입력으로 먹지 않는다.
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'TEXTAREA') return;

    const action = KEY_MAP[e.code];
    if (action) {
      this[action] = down;
      e.preventDefault();
      return;
    }
    const edge = EDGE_KEYS[e.code];
    if (edge) {
      if (down && !e.repeat) this._pressed.add(edge);
      e.preventDefault();
    }
  }

  releaseAll() {
    this.left = this.right = this.up = this.down = false;
    this.focus = this.shoot = false;
  }

  // 프레임 시작 시 호출. 이전 프레임의 엣지를 버리고 새로 눌린 것을 확정한다.
  beginFrame() {
    this.edges = this._pressed;
    this._pressed = new Set();
  }

  pressed(action) {
    return this.edges.has(action);
  }
}
