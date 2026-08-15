// 패턴 파일에서 짧게 쓰라고 만든 전역 타입 별칭.
// 이 파일 덕분에 import 경로를 길게 적지 않고 /** @param {S} s */ 만 쓰면 된다.

type S = import('./engine/stage.js').Stage;
type B = import('./engine/bullets.js').Bullet;
type Pattern = import('./engine/stage.js').Pattern;
