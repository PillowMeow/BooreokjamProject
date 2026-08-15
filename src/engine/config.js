// 시뮬레이션 전역 상수.
// 좌표계: 필드 중앙이 (0, 0), x는 오른쪽, y는 아래쪽이 양수.
// 각도: 라디안, 0 = 오른쪽(+x), 증가하면 화면상 시계 방향.

export const FIELD_W = 384;
export const FIELD_H = 448;

export const LEFT = -FIELD_W / 2;
export const RIGHT = FIELD_W / 2;
export const TOP = -FIELD_H / 2;
export const BOTTOM = FIELD_H / 2;

// 필드 밖으로 이 거리 이상 나간 탄은 제거한다.
export const CULL_MARGIN = 48;

export const FPS = 60;
export const DT = 1 / FPS;

// 한 프레임에 최대 이만큼만 따라잡는다 (탭 전환 등으로 시간이 크게 튀는 경우 대비).
export const MAX_CATCHUP_STEPS = 5;

export const MAX_BULLETS = 20000;

export const TAU = Math.PI * 2;
