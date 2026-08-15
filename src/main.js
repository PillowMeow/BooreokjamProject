import { Engine } from './engine/engine.js';
import { preparePattern } from './engine/assets.js';
import { createUI, validate } from './ui.js';

const DEFAULT_PATTERN = './patterns/boore1_easy.js';

const params = new URLSearchParams(location.search);
const patternPath = params.get('p') ?? DEFAULT_PATTERN;
const seed = Number(params.get('seed') ?? 12345);

// 경로는 src/ 기준 상대 경로 또는 절대 URL.
async function loadPath(path) {
    const url = new URL(path, import.meta.url).href;
    const module = await import(url);
    return preparePattern(validate(module.default, path));
}

const pattern = await loadPath(patternPath);
const engine = new Engine(document.getElementById('screen'), pattern, { seed });
engine.run();

createUI(engine, loadPath, patternPath);

// 콘솔에서 만져볼 수 있게.
globalThis.engine = engine;
