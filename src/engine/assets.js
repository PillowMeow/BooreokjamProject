// 이미지 로딩. 경로는 index.html 기준(예: './sprites/boss.png').

const cache = new Map();

export const DEFAULT_BOSS_SPRITE = './sprites/boss.png';

export function loadImage(path) {
  if (cache.has(path)) return cache.get(path);

  const promise = new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn(`[danmaku] 스프라이트를 못 불러왔습니다: ${path}`);
      resolve(null);
    };
    img.src = new URL(path, document.baseURI).href;
  });

  cache.set(path, promise);
  return promise;
}

/**
 * 패턴을 재생하기 전에 필요한 리소스를 붙여 둔다.
 * 히트박스가 스프라이트 크기라서 로드가 끝난 뒤에 판이 시작돼야 한다.
 */
export async function preparePattern(pattern) {
  pattern.spriteImage = await loadImage(pattern.sprite ?? DEFAULT_BOSS_SPRITE);
  return pattern;
}
