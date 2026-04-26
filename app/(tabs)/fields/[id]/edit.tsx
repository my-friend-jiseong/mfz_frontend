import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { FIELD_STATUS_VALUES, type FieldStatus } from '@/types/entities';
import { EmptyState } from '@/components/EmptyState';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

const STATUS_LABEL: Record<FieldStatus, string> = {
  pending: '대기',
  in_progress: '진행중',
  done: '완료',
};

export default function EditField() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fieldId = id ?? '';
  const router = useRouter();

  const field = useFieldStore((s) => s.getById(fieldId));
  const update = useFieldStore((s) => s.update);
  const remove = useFieldStore((s) => s.remove);

  const [addressDetail, setAddressDetail] = useState(field?.addressDetail ?? '');
  const [status, setStatus] = useState<FieldStatus>(field?.status ?? 'pending');

  if (!field) {
    return (
      <View style={styles.container}>
        <EmptyState title="현장을 찾을 수 없습니다" />
      </View>
    );
  }

  const [submitting, setSubmitting] = useState(false);

  const handleSave = async () => {
    setSubmitting(true);
    const updateRes = await update(fieldId, { detailAddress: addressDetail });
    if (!updateRes.ok) {
      setSubmitting(false);
      Alert.alert('수정 실패', updateRes.error);
      return;
    }
    if (status !== field.status) {
      const statusRes = await useFieldStore.getState().patchStatus(fieldId, status);
      if (!statusRes.ok) {
        setSubmitting(false);
        Alert.alert('상태 변경 실패', statusRes.error);
        return;
      }
    }
    setSubmitting(false);
    router.back();
  };

  const performDelete = async (force = false) => {
    const r = await remove(fieldId, force);
    if (r.ok) {
      router.replace('/(tabs)/fields' as never);
      return;
    }
    if ('needsConfirm' in r) {
      Alert.alert('현장 삭제 확인', r.message + '\n\n연관 방문 기록이 있습니다. 강제 삭제할까요? (관리자 권한 필요)', [
        { text: '취소', style: 'cancel' },
        { text: '강제 삭제', style: 'destructive', onPress: () => performDelete(true) },
      ]);
    } else {
      Alert.alert('삭제 실패', r.error);
    }
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      if (confirm('이 현장을 삭제할까요? 연관된 방문·첨부는 유지됩니다.')) {
        void performDelete(false);
      }
    } else {
      Alert.alert('현장 삭제', '이 현장을 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void performDelete(false) },
      ]);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.label}>주소 (수정 불가)</Text>
        <View style={styles.readonly}>
          <Text style={styles.readonlyText}>{field.address}</Text>
        </View>

        <Text style={styles.label}>상세 주소</Text>
        <TextInput
          value={addressDetail}
          onChangeText={setAddressDetail}
          style={styles.input}
          placeholder="예: 101동 1203호"
        />

        <Text style={styles.label}>상태</Text>
        <View style={styles.statusRow}>
          {FIELD_STATUS_VALUES.map((s) => {
            const active = status === s;
            const c = colors.fieldStatus[s];
            return (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[
                  styles.statusChip,
                  active && { backgroundColor: c + '22', borderColor: c },
                ]}
              >
                <Text
                  style={[
                    styles.statusChipText,
                    active && { color: c, fontWeight: '700' },
                  ]}
                >
                  {STATUS_LABEL[s]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={handleSave}
          disabled={submitting}
          style={({ pressed }) => [styles.btn, (pressed || submitting) && styles.pressed]}
        >
          <Text style={styles.btnText}>{submitting ? '저장 중...' : '저장'}</Text>
        </Pressable>

        <Pressable
          onPress={handleDelete}
          style={({ pressed }) => [styles.dangerBtn, pressed && styles.pressed]}
        >
          <Text style={styles.dangerText}>현장 삭제</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  readonly: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  readonlyText: { fontSize: fontSize.base, color: colors.text },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: colors.text,
  },
  statusRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusChipText: { fontSize: fontSize.sm, color: colors.textMuted },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  dangerBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  dangerText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
