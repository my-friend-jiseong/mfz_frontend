import { useMemo, useRef, useState } from 'react';
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

const DETAIL_MAX = 100;

interface FieldErrors {
  detailAddress?: string;
  status?: string;
}

export default function EditField() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fieldId = id ?? '';
  const router = useRouter();

  const field = useFieldStore((s) => s.getById(fieldId));
  const update = useFieldStore((s) => s.update);
  const remove = useFieldStore((s) => s.remove);

  // Hooks must be called unconditionally — early return 후로 옮기지 않고 옵셔널 처리.
  const initial = useMemo(
    () => ({
      addressDetail: field?.addressDetail ?? '',
      status: field?.status ?? ('pending' as FieldStatus),
    }),
    [field?.addressDetail, field?.status],
  );
  const initialRef = useRef(initial);

  const [addressDetail, setAddressDetail] = useState(initial.addressDetail);
  const [status, setStatus] = useState<FieldStatus>(initial.status);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!field) {
    return (
      <View style={styles.container}>
        <EmptyState title="현장을 찾을 수 없습니다" />
      </View>
    );
  }

  const detailTrim = addressDetail.trim();
  const hasChanges =
    detailTrim !== initialRef.current.addressDetail.trim() ||
    status !== initialRef.current.status;

  const clearFieldErr = (k: keyof FieldErrors) =>
    setFieldErrors((p) => ({ ...p, [k]: undefined }));

  const handleSave = async () => {
    setGlobalError(null);
    const errs: FieldErrors = {};
    if (detailTrim.length > DETAIL_MAX)
      errs.detailAddress = `상세 주소는 ${DETAIL_MAX}자 이하여야 합니다`;
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);

    // 변경된 항목만 호출 — 빈 PATCH 방지.
    const detailChanged = detailTrim !== initialRef.current.addressDetail.trim();
    const statusChanged = status !== initialRef.current.status;

    if (detailChanged) {
      const updateRes = await update(fieldId, { detailAddress: detailTrim });
      if (!updateRes.ok) {
        setSubmitting(false);
        // 5xx 등 서버 에러는 inline 부적합 (사용자 입력 문제 아님). 전역 표시.
        if (/일시적인 오류|일시적|서버/.test(updateRes.error)) {
          setGlobalError(updateRes.error);
        } else {
          setFieldErrors({ detailAddress: updateRes.error });
        }
        return;
      }
    }

    if (statusChanged) {
      const statusRes = await useFieldStore.getState().patchStatus(fieldId, status);
      if (!statusRes.ok) {
        setSubmitting(false);
        if (/일시적인 오류|일시적|서버/.test(statusRes.error)) {
          setGlobalError(statusRes.error);
        } else {
          setFieldErrors({ status: statusRes.error });
        }
        return;
      }
    }

    setSubmitting(false);
    router.back();
  };

  const performDelete = async () => {
    const r = await remove(fieldId);
    if (r.ok) {
      router.replace('/(tabs)/fields' as never);
      return;
    }
    if ('needsConfirm' in r) {
      // 단일 Actor 정책 — 강제 삭제 미지원, 안내만.
      Alert.alert(
        '삭제할 수 없습니다',
        r.message + '\n\n방문 기록이 남아 있는 현장은 삭제할 수 없습니다.',
      );
    } else if (/일시적인 오류|일시적|서버/.test(r.error)) {
      Alert.alert(
        '서버 오류',
        '현재 서버에서 삭제를 처리하지 못하고 있습니다.\n잠시 후 다시 시도해주세요.',
      );
    } else {
      Alert.alert('삭제 실패', r.error);
    }
  };

  const handleDelete = () => {
    if (Platform.OS === 'web') {
      if (confirm('이 현장을 삭제할까요? 연관된 방문·첨부는 유지됩니다.')) {
        void performDelete();
      }
    } else {
      Alert.alert('현장 삭제', '이 현장을 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void performDelete() },
      ]);
    }
  };

  const handleCancel = () => {
    if (!hasChanges) {
      router.back();
      return;
    }
    Alert.alert('수정 취소', '저장하지 않은 변경 사항이 있습니다. 계속 취소할까요?', [
      { text: '계속 작성', style: 'cancel' },
      { text: '버리고 나가기', style: 'destructive', onPress: () => router.back() },
    ]);
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

        <View style={styles.labelRow}>
          <Text style={styles.label}>상세 주소</Text>
          <Text style={styles.counter}>
            {addressDetail.length} / {DETAIL_MAX}
          </Text>
        </View>
        <TextInput
          value={addressDetail}
          onChangeText={(v) => {
            setAddressDetail(v);
            if (fieldErrors.detailAddress) clearFieldErr('detailAddress');
          }}
          editable={!submitting}
          maxLength={DETAIL_MAX}
          style={[styles.input, fieldErrors.detailAddress && styles.inputError]}
          placeholder="예: 101동 1203호"
        />
        {fieldErrors.detailAddress ? (
          <Text style={styles.fieldError}>{fieldErrors.detailAddress}</Text>
        ) : null}

        <Text style={styles.label}>상태</Text>
        <View style={styles.statusRow}>
          {FIELD_STATUS_VALUES.map((s) => {
            const active = status === s;
            const c = colors.fieldStatus[s];
            return (
              <Pressable
                key={s}
                onPress={() => {
                  setStatus(s);
                  if (fieldErrors.status) clearFieldErr('status');
                }}
                disabled={submitting}
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
        {fieldErrors.status ? (
          <Text style={styles.fieldError}>{fieldErrors.status}</Text>
        ) : null}

        {globalError ? <Text style={styles.error}>{globalError}</Text> : null}

        <Pressable
          onPress={handleSave}
          disabled={submitting || !hasChanges}
          style={({ pressed }) => [
            styles.btn,
            (!hasChanges || submitting) && styles.btnDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.btnText,
              (!hasChanges || submitting) && styles.btnTextDisabled,
            ]}
          >
            {submitting ? '저장 중...' : hasChanges ? '저장' : '변경 사항 없음'}
          </Text>
        </Pressable>

        <Pressable onPress={handleCancel} style={styles.cancel}>
          <Text style={styles.cancelText}>취소</Text>
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  counter: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
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
  inputError: { borderColor: colors.danger },
  fieldError: {
    color: colors.danger,
    fontSize: fontSize.xs,
    marginTop: 4,
    marginLeft: 4,
  },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
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
  btnDisabled: { backgroundColor: colors.border },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  btnTextDisabled: { color: colors.textMuted },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { color: colors.textMuted, fontSize: fontSize.sm },
  dangerBtn: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  dangerText: { color: colors.danger, fontSize: fontSize.sm, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
