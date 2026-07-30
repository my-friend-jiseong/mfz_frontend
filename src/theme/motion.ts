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
  // 비활성 컨트롤. 0.4 는 '못 누른다' 를 확실히 말하지만 글자를 읽을 수 없게 만든다 —
  // 버튼·아이콘처럼 라벨을 다시 읽을 필요가 없는 것에만 쓴다.
  disabled: 0.4,
  // 비활성이지만 **값을 계속 읽어야 하는** 것(입력란, 읽기 전용 필드). 저장 중에 방금 쓴
  // 내용이 사라지듯 흐려지면 안 된다. Input 에 0.7 이 리터럴로 박혀 있던 것을 토큰화했다 —
  // 같은 폼에서 입력란 0.7 / 버튼 0.4 로 갈리는 게 우연이 아니라 결정임을 남긴다.
  disabledField: 0.7,
  hover: 0.92,
} as const;
