import { forwardRef, useCallback, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize, fontWeight } from '@/theme/spacing';
import { fontFamily } from '@/theme/typography';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  leftSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
}

export const Input = forwardRef<TextInput, Props>(function Input(
  {
    label,
    error,
    helperText,
    leftSlot,
    rightSlot,
    containerStyle,
    style,
    editable = true,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const [focused, setFocused] = useState(false);

  // RN 0.81 은 TextInput 의 onFocus/onBlur 를 FocusEvent/BlurEvent 로 타이핑한다 —
  // props 에서 직접 뽑아 써야 버전 차이에 안 깨진다.
  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    (e) => {
      setFocused(true);
      onFocus?.(e);
    },
    [onFocus],
  );
  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    (e) => {
      setFocused(false);
      onBlur?.(e);
    },
    [onBlur],
  );

  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View
        style={[
          styles.field,
          // 우선순위: error > focus > disabled > default. 테두리 '색' 만 바꾼다 —
          // borderWidth 를 키우면 폼 전체가 1px 씩 밀린다.
          !editable && styles.fieldDisabled,
          focused && editable ? styles.fieldFocused : null,
          error ? styles.fieldError : null,
        ]}
      >
        {leftSlot ? <View style={styles.slot}>{leftSlot}</View> : null}
        <TextInput
          ref={ref}
          editable={editable}
          placeholderTextColor={colors.textSubtle}
          {...rest}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[styles.input, style]}
        />
        {rightSlot ? <View style={styles.slot}>{rightSlot}</View> : null}
      </View>
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helper}>{helperText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  // 입력은 inset — 주변 표면(흰 Card / slate50 캔버스)보다 어둡다.
  // 채움만으로 "여기에 입력" 이 읽히므로 테두리는 존재만 알리는 정도.
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.control.bg,
    borderWidth: 1,
    borderColor: colors.control.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  fieldFocused: { borderColor: colors.control.borderFocus },
  fieldError: { borderColor: colors.control.borderError },
  fieldDisabled: {
    backgroundColor: colors.control.bgDisabled,
    opacity: 0.7,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.base,
    color: colors.text,
  },
  slot: {
    paddingHorizontal: spacing.xs,
    justifyContent: 'center',
  },
  error: {
    fontFamily: fontFamily.regular,
    color: colors.danger,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  helper: {
    fontFamily: fontFamily.regular,
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
});
