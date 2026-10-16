import React, { forwardRef } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import { Icon } from '@/components/icons';
import { c2, radius2, space } from '@/theme/v2';
import { MemoField } from './MemoField';
import { Text } from './Text';

// 2차 폼 조각 — 10 내 정보·11 로그인 계열(Figma 584:2640, 588:2614, 727:2152 등)이 같은 모양을 쓴다.
// 칸 자체는 MemoField(52, 테두리 1.5) 를 그대로 쓰고, 오류일 때만 테두리를 빨강 2 로 바꾼다.

/** 칸 아래 빨간 오류 줄 — 느낌표 원 16 + 13 SemiBold(11-3·10-3). */
export function FieldMessage({ message, style }: { message: string; style?: object }) {
  return (
    <View style={[styles.msgRow, style]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Icon name="alert" size={16} color={c2.text.danger} style={styles.msgIcon} />
      <Text v2="caption.semibold" tone="danger" style={styles.msgText}>
        {message}
      </Text>
    </View>
  );
}

interface FieldProps {
  label: string;
  /** 있으면 칸 아래 빨간 줄. helper 보다 우선한다(11-3: 오류가 뜨면 안내 줄은 사라짐). */
  error?: string | null;
  /** 칸 아래 회색 안내 줄(비밀번호 규칙 등). */
  helper?: string;
  children: React.ReactNode;
}

/** 라벨(13 Bold) + 칸 + 안내/오류 줄 한 묶음. 묶음끼리 간격은 부모(FormStack)가 준다. */
export function FormField({ label, error, helper, children }: FieldProps) {
  return (
    <View>
      <Text v2="caption.bold" tone="body" style={styles.label}>
        {label}
      </Text>
      {children}
      {error ? (
        <FieldMessage message={error} style={styles.below} />
      ) : helper ? (
        <Text v2="caption.regular" tone="tertiary" style={styles.below}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

type InputProps = React.ComponentProps<typeof MemoField> & { invalid?: boolean };

/** 한 줄 입력(MemoField) + 오류 테두리. 음성 버튼은 쓰지 않는다. */
export const TextField2 = forwardRef<TextInput, InputProps>(function TextField2({ invalid, style, ...rest }, ref) {
  return <MemoField ref={ref} {...rest} style={[invalid && styles.invalid, style]} />;
});

/** 바꿀 수 없는 값(10-1 이메일) — 옅은 회색 바탕, 테두리 없음. */
export function ReadonlyField({ value }: { value: string }) {
  return (
    <View style={styles.readonly} accessible accessibilityLabel={value}>
      <Text v2="bodyL.regular" tone="tertiary" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: space[6] },
  below: { marginTop: space[6] },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[4] },
  msgIcon: { marginTop: 1 },
  msgText: { flex: 1 },
  invalid: { borderWidth: 2, borderColor: c2.danger },
  readonly: {
    height: 52,
    justifyContent: 'center',
    paddingHorizontal: space[14],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.subtle,
  },
});
