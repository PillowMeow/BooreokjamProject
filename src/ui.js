import { PATTERNS } from './patterns/index.js';
import { preparePattern } from './engine/assets.js';

// 화면 구석에 붙는 최소한의 조작부: 탄막 선택 / 로컬 파일 열기 / 재시작·일시정지 / 상태 표시.
// 마우스를 올리기 전에는 흐릿하게 있어서 플레이를 방해하지 않는다.

const CSS = `
#sim-ui {
  position: fixed; top: 8px; right: 8px; z-index: 10;
  display: flex; flex-direction: column; gap: 5px;
  padding: 8px; border-radius: 6px;
  background: rgba(10, 12, 18, 0.72);
  border: 1px solid rgba(140, 170, 220, 0.18);
  font: 11px/1.5 ui-monospace, Menlo, Consolas, monospace;
  color: #b8c6dd;
  opacity: 0.35; transition: opacity 0.15s;
}
#sim-ui:hover, #sim-ui:focus-within { opacity: 1; }
#sim-ui select, #sim-ui button, #sim-ui label {
  font: inherit; color: #dbe6f5;
  background: #161a24; border: 1px solid rgba(140, 170, 220, 0.25);
  border-radius: 4px; padding: 3px 6px; cursor: pointer;
}
#sim-ui .row { display: flex; gap: 5px; }
#sim-ui .row > * { flex: 1; }
#sim-ui input[type=file] { display: none; }
#sim-ui .status { color: #7d8ba3; white-space: pre; }
#sim-ui .error { color: #ff8095; max-width: 200px; white-space: pre-wrap; }
`;

/**
 * @param {import('./engine/engine.js').Engine} engine
 * @param {(path: string) => Promise<object>} loadPath  경로로 패턴 모듈을 불러오는 함수
 */
export function createUI(engine, loadPath, currentPath) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'sim-ui';
  root.innerHTML = `
    <select class="pick"></select>
    <div class="row">
      <label class="open">파일 열기<input type="file" accept=".js,.mjs"></label>
      <button class="restart">재시작 (R)</button>
    </div>
    <div class="row">
      <button class="pause">일시정지 (P)</button>
    </div>
    <div class="status"></div>
    <div class="error"></div>
  `;
  document.body.appendChild(root);

  const pick = root.querySelector('.pick');
  const file = root.querySelector('input[type=file]');
  const restart = root.querySelector('.restart');
  const pause = root.querySelector('.pause');
  const status = root.querySelector('.status');
  const error = root.querySelector('.error');

  for (const p of PATTERNS) {
    const opt = document.createElement('option');
    opt.value = p.path;
    opt.textContent = p.label;
    pick.appendChild(opt);
  }
  if (currentPath && PATTERNS.some((p) => p.path === currentPath)) {
    pick.value = currentPath;
  } else {
    // ?p= 로 목록에 없는 걸 열었으면 그 항목을 임시로 넣어 둔다.
    const opt = document.createElement('option');
    opt.value = currentPath;
    opt.textContent = `${engine.pattern.name ?? currentPath} (직접 지정)`;
    pick.appendChild(opt);
    pick.value = currentPath;
  }

  const fail = (err) => {
    error.textContent = String(err.message ?? err);
    console.error('[danmaku]', err);
  };

  pick.addEventListener('change', async () => {
    error.textContent = '';
    try {
      engine.setPattern(await loadPath(pick.value));
      const url = new URL(location.href);
      url.searchParams.set('p', pick.value);
      history.replaceState(null, '', url);
    } catch (err) {
      fail(err);
    }
    pick.blur();
  });

  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    error.textContent = '';
    try {
      engine.setPattern(await loadLocalFile(f));
      const opt = document.createElement('option');
      opt.value = `file:${f.name}`;
      opt.textContent = `${f.name} (로컬)`;
      pick.appendChild(opt);
      pick.value = opt.value;
    } catch (err) {
      fail(err);
    }
    file.value = '';
  });

  restart.addEventListener('click', () => {
    engine.restart();
    restart.blur();
  });

  pause.addEventListener('click', () => {
    engine.paused = !engine.paused;
    pause.blur();
  });

  // 상태 표시는 프레임마다 갱신할 필요가 없다.
  setInterval(() => {
    const s = engine.stage;
    status.textContent =
      `${s.mode === 'survival' ? `남은 ${s.remaining.toFixed(1)}초` : `게이지 ${(s.gauge * 100).toFixed(0)}%`}` +
      `  단계 ${s.phase + 1}/${s.thresholds.length + 1}\n` +
      `f ${s.frame}  탄 ${s.bulletCount}\n` +
      `폭탄 ${s.stats.bombs}  피격 ${s.player.deaths}  스침 ${s.player.graze}\n` +
      `이동 방향키  저속 Shift\n샷 Z  폭탄 X` +
      (engine.paused ? '\n[일시정지]' : s.result ? '\n[클리어]' : '');
  }, 100);

  return root;
}

/** 로컬 .js 파일을 Blob URL로 감싸 import 한다. (파일 안의 상대 import는 못 쓴다) */
async function loadLocalFile(fileHandle) {
  const text = await fileHandle.text();
  const url = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
  try {
    const module = await import(/* @vite-ignore */ url);
    return preparePattern(validate(module.default, fileHandle.name));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function validate(pattern, label) {
  if (!pattern || typeof pattern.main !== 'function') {
    throw new Error(`${label}: default export에 제너레이터 main(s)가 없습니다.`);
  }
  return pattern;
}
