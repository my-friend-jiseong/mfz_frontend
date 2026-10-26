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
import { Text } from './Text';
import { Touchable } from './Touchable';

interface Props extends Omit<TextInputProps, 'style'> {
  /**
   * 음성 입력 버튼(오른쪽 44 검은 버튼). 넘길 때만 보인다 — 체크인 메모(8·8-2)만 쓴다.
   * listening 이면 8-2 '메모 입력, 음성 받아쓰는 중': 테두리 2 brand, 입력 대신 지금 값 + 아직 확정 안 된 말(옅게) + 커서.
   */
  voice?: { onPress: () => void; listening?: boolean; interim?: string };
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
  // 웹 textarea 는 rows 로 높이가 굳는다 — 내용 높이(onContentSizeChange: 마운트·입력 때)를 칸 높이로 쓴다.
  // 받아쓴 말이 붙으면 듣는 중 표시에서 입력칸으로 돌아오며 다시 마운트되므로 그때도 맞는다.
  const [webHeight, setWebHeight] = useState<number | null>(null);
  const autoGrow = multiline && Platform.OS === 'web';
  if (voice?.listening) {
    const value = rest.value ?? '';
    const interim = voice.interim ?? '';
    return (
      <View
        style={[styles.box, styles.multi, styles.listening, style]}
        accessibilityLabel="메모 입력, 음성 받아쓰는 중"
        accessibilityLiveRegion="polite"
      >
        <Text v2="bodyM.regular" style={styles.listeningText}>
          {value}
          {value && interim && !/\s$/.test(value) ? ' ' : ''}
          {interim ? <Text v2="bodyM.regular" tone="disabled">{interim}</Text> : null}
          {/* 커서(Figma 2×18 brand) — 중첩 Text 는 테두리를 못 그려 글자 막대로 그린다. */}
          <Text v2="bodyM.regular" tone="link">
            |
          </Text>
        </Text>
      </View>
    );
  }
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
        onContentSizeChange={(e) => {
          if (autoGrow) setWebHeight(e.nativeEvent.contentSize.height);
          rest.onContentSizeChange?.(e);
        }}
        style={[styles.input, multiline && styles.inputMulti, autoGrow && webHeight != null && { height: webHeight }, WEB_NO_OUTLINE]}
      />
      {voice ? (
        <Touchable
          onPress={voice.onPress}
          accessibilityRole="button"
          accessibilityLabel="음성으로 입력"
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
  // Figma 8-2: 테두리 2 brand, 첫 줄 위 13, 높이 76(두 줄 남짓)에서 시작.
  listening: { minHeight: 76, borderWidth: 2, borderColor: c2.border.brand, paddingLeft: space[14] - 0.5 },
  listeningText: { flex: 1, paddingTop: 13, paddingBottom: space[14], paddingRight: space[10], color: c2.text.primary },
  mic: {
    width: 44,
    height: 44,
    borderRadius: radius2.md,
    backgroundColor: c2.bg.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
