import { Easing as RNEasing } from 'react-native';
import { Easing as REasing, useReducedMotion } from 'react-native-reanimated';

// 모션은 의미가 있을 때만. transition 200ms 넘으면 사용자가 기다린다.
export const duration = {
  instant: 80,
  fast: 120,
  base: 180,
  slow: 240,
} as const;

export const easing = {
  // 곡선 파라미터. 실제 애니메이션에는 아래 animEasing(RN Animated)·rEasing(reanimated)을 쓴다.
  standard: [0.2, 0, 0, 1] as const, // 표준 진입/퇴장
  emphasized: [0.3, 0, 0, 1] as const, // 강조 (큰 모션)
  decel: [0, 0, 0, 1] as const, // 들어옴
  accel: [0.4, 0, 1, 1] as const, // 나감
} as const;

type Curve = readonly [number, number, number, number];

// RN Animated.timing 용. 들어올 때 decel(enter), 나갈 때 accel(exit).
const rn = (c: Curve) => RNEasing.bezier(c[0], c[1], c[2], c[3]);
export const animEasing = {
  standard: rn(easing.standard),
  emphasized: rn(easing.emphasized),
  enter: rn(easing.decel),
  exit: rn(easing.accel),
} as const;

// reanimated withTiming·레이아웃 애니메이션 용(워클릿 팩토리라 RN Animated 와 섞어 쓸 수 없다).
const re = (c: Curve) => REasing.bezier(c[0], c[1], c[2], c[3]);
export const rEasing = {
  standard: re(easing.standard),
  emphasized: re(easing.emphasized),
  enter: re(easing.decel),
  exit: re(easing.accel),
} as const;

/**
 * 시스템 '동작 줄이기'(iOS 동작 줄이기·안드로이드 애니메이션 제거·웹 prefers-reduced-motion).
 * 켜져 있으면 오버레이는 움직임(이동·확대) 없이 투명도만, duration.instant 로 바꾼다.
 * 앱 시작 시점 값이다(reanimated 와 같음) — 설정을 바꾸면 앱을 다시 열어야 반영된다.
 */
export function useReducedMotionPref(): boolean {
  return useReducedMotion();
}

export const opacity = {
  pressed: 0.85,
  // 비활성 컨트롤. 0.4 는 '못 누른다' 를 확실히 말하지만 글자를 읽을 수 없게 만든다 —
  // 버튼·아이콘처럼 라벨을 다시 읽을 필요가 없는 것에만 쓴다.
  disabled: 0.4,
  // 비활성이지만 **값을 계속 읽어야 하는** 것(입력란, 읽기 전용 필드). 저장 중에 방금 쓴
  // 내용이 사라지듯 흐려지면 안 된다. Input 에 0.7 이 리터럴로 박혀 있던 것을 토큰화했다 —
  // 같은 폼에서 입력란 0.7 / 버튼 0.4 로 갈리는 게 우연이 아니라 결정임을 남긴다.
  disabledField: 0.7,
  // `hover: 0.92` 는 제거했다 (2026-07-30 §14 감사, callsite 0). Play 전용 앱이라 hover 가
  // 실제로 필요한 자리가 없었고, hover 도입 여부는 14절에 '미결' 로 남아 있다 —
  // 결정 전에 토큰만 있으면 "이미 정해졌다" 로 읽힌다. 정하는 날 이유와 함께 되살린다.
} as const;
