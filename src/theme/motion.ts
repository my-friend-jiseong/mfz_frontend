// 모션은 의미가 있을 때만. transition 200ms 넘으면 사용자가 기다린다.
export const duration = {
  instant: 80,
  fast: 120,
  base: 180,
  slow: 240,
} as const;

export const easing = {
  // RN Animated 와 reanimated Easing 호환되도록 곡선 파라미터만 정의.
  standard: [0.2, 0, 0, 1] as const, // 표준 진입/퇴장
  emphasized: [0.3, 0, 0, 1] as const, // 강조 (큰 모션)
  decel: [0, 0, 0, 1] as const, // 들어옴
  accel: [0.4, 0, 1, 1] as const, // 나감
} as const;

export const opacity = {
  pressed: 0.85,
  disabled: 0.4,
  hover: 0.92,
} as const;
