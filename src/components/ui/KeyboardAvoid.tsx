import React from 'react';
import { KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * 키보드가 폼 하단(입력칸·하단 액션 바)을 가리지 않게 하는 래퍼. 화면 바닥까지 닿는 컨테이너에 쓴다.
 *
 * Android: Reanimated `useAnimatedKeyboard` 로 키보드 높이를 **매 프레임** 따라가 아래를 비운다.
 *   Expo SDK 54 는 Android 에서 edge-to-edge 라 adjustResize 로 창이 줄지 않고, 기존 코드의
 *   KeyboardAvoidingView(behavior=undefined) 는 아무것도 하지 않았다(에뮬레이터 실측 2026-09-30:
 *   체크인 메모 칸과 하단 바가 키보드 뒤로 숨음). Keyboard 이벤트(DidShow)로 재는 방식은 리뷰에서
 *   걸렸다 — 높이에서 내비게이션 바가 빠져 있고(edge-to-edge 컨테이너는 그 아래까지 간다),
 *   이모지 패널·제안 줄처럼 열린 채 높이가 바뀌는 경우를 놓친다. translucent 옵션을 켜야 높이가
 *   화면 바닥 기준(내비게이션 바 포함)으로 온다.
 * iOS: 기존과 같이 KeyboardAvoidingView(padding).
 * 웹: 가상 키보드가 레이아웃을 스스로 밀어 올리므로 그대로.
 */
export function KeyboardAvoid({ children, style }: Props) {
  if (Platform.OS === 'ios') {
    return (
      <KeyboardAvoidingView style={style} behavior="padding">
        {children}
      </KeyboardAvoidingView>
    );
  }
  if (Platform.OS === 'android') {
    return <AndroidKeyboardAvoid style={style}>{children}</AndroidKeyboardAvoid>;
  }
  return <View style={style}>{children}</View>;
}

function AndroidKeyboardAvoid({ children, style }: Props) {
  const keyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
    isNavigationBarTranslucentAndroid: true,
  });
  // 반환 키를 항상 같게 둔다 — 키가 바뀌는 animated style 은 Fabric 에서 적용되지 않은 전례가 있다
  // (MapSheetLayout 의 gorhom height 주석).
  const animated = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
