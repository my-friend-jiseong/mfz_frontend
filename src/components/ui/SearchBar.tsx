import React, { forwardRef, useState } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Icon } from '@/components/icons';
import { c2, elevation2, radius2, space, type2 } from '@/theme/v2';
import { Text } from './Text';
import { Touchable } from './Touchable';

interface Props extends Omit<TextInputProps, 'style'> {
  value: string;
  onChangeText?: (v: string) => void;
  /** 지우기 버튼. 없으면 onChangeText('') 를 부른다. */
  onClear?: () => void;
  /**
   * 주면 입력칸 대신 누르는 버튼으로 그린다(지도 화면 → 검색 화면으로 가는 입구).
   * 이때 value 가 있으면 값, 없으면 placeholder 를 보여 준다.
   */
  onPressLauncher?: () => void;
  /** 입구 모양(onPressLauncher). floating(기본)=흰 바탕·그림자(지도 위), muted=회색 바탕·그림자 없음(5 현장 상세 머리). */
  launcherLook?: 'floating' | 'muted';
  style?: StyleProp<ViewStyle>;
}

// 웹 TextInput 의 브라우저 포커스 테두리 — 포커스 표시는 바깥 상자의 파란 테두리가 맡는다.
const WEB_NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;

/**
 * 지도 위 알약형 검색창(Figma SearchBar 533:1164). 52 높이, 입력 중이면 파란 테두리, 값이 있으면 지우기 버튼.
 */
export const SearchBar = forwardRef<TextInput, Props>(function SearchBar(
  { value, onChangeText, onClear, onPressLauncher, launcherLook = 'floating', placeholder = '현장 이름이나 주소 검색', style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const filled = value.length > 0;

  if (onPressLauncher) {
    // 지우기 버튼은 입구 버튼의 형제로 둔다 — 버튼 안 버튼은 스크린리더가 하나로 읽는다.
    return (
      <View style={[styles.box, launcherLook === 'muted' && styles.muted, filled && onClear && styles.filled, style]}>
        <Touchable
          onPress={onPressLauncher}
          accessibilityRole="search"
          accessibilityLabel={filled ? `검색어 ${value}` : placeholder}
          noAutoHitSlop
          style={styles.launcher}
        >
          <Icon name="search" size={20} color={c2.text.primary} />
          <Text
            v2={filled ? 'bodyL.semibold' : 'bodyL.regular'}
            tone={filled ? 'primary' : 'tertiary'}
            style={styles.flex}
            numberOfLines={1}
          >
            {filled ? value : placeholder}
          </Text>
        </Touchable>
        {filled && onClear ? (
          <Touchable onPress={onClear} accessibilityRole="button" accessibilityLabel="검색어 지우기" style={styles.clear}>
            <Icon name="clear" size={20} color={c2.bg.strong} />
          </Touchable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.box, focused && styles.focused, filled && styles.filled, style]}>
      <Icon name="search" size={20} color={c2.text.primary} />
      <TextInput
        ref={ref}
        {...rest}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c2.text.tertiary}
        returnKeyType="search"
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, filled ? styles.inputFilled : null, WEB_NO_OUTLINE]}
      />
      {filled ? (
        <Touchable
          onPress={() => (onClear ? onClear() : onChangeText?.(''))}
          accessibilityRole="button"
          accessibilityLabel="검색어 지우기"
          style={styles.clear}
        >
          <Icon name="clear" size={20} color={c2.bg.strong} />
        </Touchable>
      ) : null}
    </View>
  );
});

const { lineHeight: _lh, ...inputText } = type2['bodyL.regular'];
const { lineHeight: _lh2, ...inputTextFilled } = type2['bodyL.semibold'];

const styles = StyleSheet.create({
  box: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[10],
    paddingLeft: 18,
    paddingRight: space[16],
    borderRadius: radius2.full,
    backgroundColor: c2.bg.canvas,
    // 포커스 때 2px 테두리가 생겨도 내용이 밀리지 않게 평소에도 투명 테두리를 둔다.
    borderWidth: 2,
    borderColor: 'transparent',
    ...elevation2.control,
  },
  focused: { borderColor: c2.border.brand },
  muted: { backgroundColor: c2.bg.muted, boxShadow: [] },
  filled: { paddingRight: space[8] },
  flex: { flex: 1, minWidth: 0 },
  launcher: { flex: 1, minWidth: 0, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: space[10] },
  input: { flex: 1, minWidth: 0, ...inputText, color: c2.text.primary, paddingVertical: 0 },
  inputFilled: inputTextFilled,
  clear: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
