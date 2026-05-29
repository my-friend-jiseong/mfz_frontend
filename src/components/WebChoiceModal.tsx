import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type AlertButton,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { withAlpha } from '@/theme/withAlpha';

// react-native-web 의 Alert 는 모듈 import 시점에 webAlertPatch 가
// window.confirm 으로 monkey-patch 하지만, 3+ 버튼은 OK/Cancel 양분이라
// 비-cancel 첫 버튼이 강제 호출됨. 의미 있는 라벨 선택이 필요한 곳
// (현장 상태 변경, AI 보고서 사진 슬롯, 메모 import 모드 선택) 에서는
// 이 컴포넌트를 사용해 web 분기.
//
// native 에서는 promptChoice 가 Alert.alert 를 그대로 호출하므로 동일 UX.

export interface ChoiceOption {
  label: string;
  /** 'destructive' | 'cancel' — 시각적 강조용. cancel 은 항상 모달 우측 (또는 단독). */
  style?: 'default' | 'destructive' | 'cancel';
  onPress?: () => void;
}

interface WebChoicePending {
  title: string;
  message?: string;
  options: ChoiceOption[];
}

let openWeb: ((p: WebChoicePending) => void) | null = null;

/**
 * 다중 선택 다이얼로그.
 * - native: Alert.alert 호출 (기존 동작 유지)
 * - web: WebChoiceModal 호스트가 표시한 모달에서 선택
 *
 * 사용처는 Alert.alert 와 동일한 시그니처지만 cancel 옵션은 항상 마지막에 두는 것을 권장.
 */
export function promptChoice(
  title: string,
  message: string | undefined,
  options: ChoiceOption[],
): void {
  if (Platform.OS !== 'web') {
    const buttons: AlertButton[] = options.map((o) => ({
      text: o.label,
      style: o.style,
      onPress: o.onPress,
    }));
    Alert.alert(title, message, buttons);
    return;
  }
  // web — 호스트가 등록되어 있어야 모달이 뜸. 미등록 시 Alert.alert (= webAlertPatch) 로 폴백.
  if (openWeb) {
    openWeb({ title, message, options });
  } else {
    const buttons: AlertButton[] = options.map((o) => ({
      text: o.label,
      style: o.style,
      onPress: o.onPress,
    }));
    Alert.alert(title, message, buttons);
  }
}

/**
 * App 루트(_layout.tsx)에 1회 마운트해서 promptChoice('web') 호출을 받아 모달로 노출.
 * 미마운트 시 promptChoice 는 Alert.alert 폴백으로 동작.
 */
export function WebChoiceModalHost() {
  const [pending, setPending] = useState<WebChoicePending | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    openWeb = (p) => setPending(p);
    return () => {
      openWeb = null;
    };
  }, []);

  if (Platform.OS !== 'web' || !pending) return null;

  const close = () => setPending(null);
  const handlePick = (opt: ChoiceOption) => {
    close();
    // 다음 tick 에서 onPress — 모달이 사라진 뒤 콜백이 발화하도록.
    setTimeout(() => opt.onPress?.(), 0);
  };

  // cancel 은 항상 분리된 영역에 배치, 나머지는 옵션 카드로 노출.
  const cancel = pending.options.find((o) => o.style === 'cancel');
  const choices = pending.options.filter((o) => o.style !== 'cancel');

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text variant="h3">{pending.title}</Text>
          {pending.message ? (
            <Text variant="bodySm" color="textMuted">
              {pending.message}
            </Text>
          ) : null}
          <View style={styles.choices}>
            {choices.map((o, idx) => (
              <Pressable
                key={`${o.label}-${idx}`}
                onPress={() => handlePick(o)}
                style={({ pressed }) => [
                  styles.choice,
                  o.style === 'destructive' && styles.choiceDanger,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  variant="body"
                  weight="bold"
                  color={o.style === 'destructive' ? 'danger' : 'primary'}
                >
                  {o.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {cancel ? (
            <Pressable
              onPress={() => handlePick(cancel)}
              style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
            >
              <Text variant="bodySm" weight="semibold" color="textMuted">
                {cancel.label}
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  choices: { gap: spacing.sm, marginTop: spacing.xs },
  choice: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: withAlpha(colors.primary, 0.06),
    alignItems: 'center',
  },
  choiceDanger: {
    borderColor: colors.danger,
    backgroundColor: withAlpha(colors.danger, 0.06),
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
  },
  pressed: { opacity: 0.85 },
});
