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
import { c2, radius2, space, type2 } from '@/theme/v2';
import { Touchable } from './Touchable';

interface Props extends Omit<TextInputProps, 'style'> {
  /**
   * 음성 입력 버튼(오른쪽 44 검은 버튼). 이번 개편에선 음성 메모를 하지 않아 기본은 숨김 —
   * 넘길 때만 보인다(결정 Q1, 인수인계 8-1·8-2).
   */
  voice?: { onPress: () => void; listening?: boolean };
  style?: StyleProp<ViewStyle>;
}

const WEB_NO_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as TextStyle | null;
const { lineHeight: _lh, ...inputText } = type2['bodyM.regular'];

/** 메모·이름 입력칸(Figma MemoField 534:1260). 52 높이, multiline 이면 내용만큼 자란다. */
export const MemoField = forwardRef<TextInput, Props>(function MemoField(
  { voice, style, placeholder = '메모 입력', multiline, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.box, focused && styles.focused, multiline && styles.multi, style]}>
      <TextInput
        ref={ref}
        {...rest}
        multiline={multiline}
        // 웹 textarea 는 rows 기본 2 — 한 줄 칸으로 시작하게 1 을 준다. 네이티브(Android)는 줄 수를 고정해 버려 넘기지 않는다.
        numberOfLines={multiline && Platform.OS === 'web' ? (rest.numberOfLines ?? 1) : rest.numberOfLines}
        placeholder={placeholder}
        placeholderTextColor={c2.text.tertiary}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, multiline && styles.inputMulti, WEB_NO_OUTLINE]}
      />
      {voice ? (
        <Touchable
          onPress={voice.onPress}
          accessibilityRole="button"
          accessibilityLabel={voice.listening ? '음성 입력 멈추기' : '음성으로 입력'}
          style={styles.mic}
        >
          <Icon name="mic" size={20} color={c2.text.inverse} />
        </Touchable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingLeft: space[14],
    paddingRight: space[4],
    borderRadius: radius2.lg,
    borderWidth: 1.5,
    borderColor: c2.border.default,
    backgroundColor: c2.bg.canvas,
  },
  focused: { borderColor: c2.border.brand },
  // 여러 줄도 한 줄일 때는 한 줄 칸과 같은 높이(Figma 8 메모 54)로 시작해 내용만큼 자란다.
  multi: { alignItems: 'flex-start' },
  input: { flex: 1, ...inputText, color: c2.text.primary, minHeight: 44, paddingVertical: 0, paddingRight: space[10] },
  inputMulti: { lineHeight: type2['bodyM.regular'].lineHeight, minHeight: 0, paddingVertical: space[14], textAlignVertical: 'top' },
  mic: {
    width: 44,
    height: 44,
    borderRadius: radius2.md,
    backgroundColor: c2.bg.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
