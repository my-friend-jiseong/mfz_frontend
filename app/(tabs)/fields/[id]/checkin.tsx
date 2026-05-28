import { useEffect, useRef, useState } from 'react';
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
import { safeBack } from '@/utils/backNavigation';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { VISIT_STATUS_VALUES, VISIT_STATUS_LABEL, type VisitStatus } from '@/types/entities';
import { EmptyState } from '@/components/EmptyState';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// ERD v2: 체크인은 방문 기록(trip·field·시각·status)만 생성. 메모·사진·음성 첨부는
// 현장(field) 상세에서 관리. 방문 상태는 단일 status (result_status·status_reason 제거).

export default function FieldCheckin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fieldId = id ?? '';
  const router = useRouter();

  const field = useFieldStore((s) => s.getById(fieldId));
  const activeTripId = useTripStore((s) => s.activeTripId);
  const checkIn = useVisitStore((s) => s.checkIn);
  const setResult = useVisitStore((s) => s.setResult);
  const findDestination = useDestinationStore((s) => s.findByTripField);
  const markDestinationArrived = useDestinationStore((s) => s.markArrived);

  const [visitId, setVisitId] = useState<string | null>(null);
  const [status, setStatus] = useState<VisitStatus>('completed');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  // checkIn 중복 호출 가드 — StrictMode dev 더블 마운트 / 빠른 재 mount 시 visit 두 번 생성 방지
  const checkInGuardRef = useRef(false);

  useEffect(() => {
    if (
      activeTripId !== null &&
      fieldId &&
      visitId === null &&
      !checkInGuardRef.current
    ) {
      checkInGuardRef.current = true;
      void (async () => {
        const r = await checkIn(activeTripId, fieldId);
        if (r.ok) {
          setVisitId(r.visit.id);
        } else {
          checkInGuardRef.current = false;
          Alert.alert('체크인 실패', r.error);
        }
      })();
    }
  }, [activeTripId, fieldId, visitId, checkIn]);

  if (!field) {
    return <EmptyState title="현장을 찾을 수 없습니다" />;
  }

  if (activeTripId === null) {
    return (
      <EmptyState
        title="외근 시작 후 체크인 가능합니다"
        description="외근 탭에서 외근을 시작해주세요"
      />
    );
  }

  const reasonTrim = reason.trim();
  const otherReasonValid = status !== 'other' || reasonTrim.length >= 10;

  const handleSaveResult = async () => {
    if (!visitId || saving || !otherReasonValid) return;
    setSaving(true);
    const r = await setResult(visitId, status, status === 'other' ? reasonTrim : undefined);
    setSaving(false);
    if (!r.ok) {
      Alert.alert('상태 저장 실패', r.error);
      return;
    }
    if (activeTripId !== null) {
      const dest = findDestination(activeTripId, fieldId);
      if (dest && dest.status === 'pending') {
        markDestinationArrived(dest.id);
      }
    }
    safeBack(router);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>체크인 완료</Text>
          <Text style={styles.headerSub}>{field.address}</Text>
          {field.addressDetail ? (
            <Text style={styles.headerSubMuted}>{field.addressDetail}</Text>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>방문 결과 상태</Text>
        <View style={styles.statusGrid}>
          {VISIT_STATUS_VALUES.map((s) => {
            const active = status === s;
            const c = colors.visitStatus[s];
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
                  {VISIT_STATUS_LABEL[s]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {status === 'other' ? (
          <View style={styles.reasonBox}>
            <Text style={styles.reasonLabel}>기타 사유 (10자 이상 필수)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              style={styles.reasonInput}
              placeholder="현장 상황을 10자 이상 설명해주세요"
              maxLength={500}
              multiline
            />
            <Text style={[styles.reasonCounter, reasonTrim.length < 10 && styles.reasonCounterError]}>
              {reasonTrim.length} / 10자 이상
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => router.push(`/(tabs)/fields/${fieldId}` as never)}
          style={({ pressed }) => [styles.linkBtn, pressed && styles.pressed]}
        >
          <Text style={styles.linkBtnText}>메모·사진은 현장 상세에서 관리 →</Text>
        </Pressable>

        <Pressable
          onPress={handleSaveResult}
          disabled={saving || !visitId || !otherReasonValid}
          style={({ pressed }) => [
            styles.btn,
            pressed && styles.pressed,
            (saving || !visitId || !otherReasonValid) && styles.btnDisabled,
          ]}
        >
          <Text style={styles.btnText}>
            {saving ? '저장 중...' : '결과 저장하고 완료'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  header: {
    backgroundColor: colors.primary + '10',
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  headerTitle: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  headerSub: { fontSize: fontSize.base, color: colors.text, marginTop: 2 },
  headerSubMuted: { fontSize: fontSize.sm, color: colors.textMuted },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  statusChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  statusChipText: { fontSize: fontSize.sm, color: colors.textMuted },
  reasonBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  reasonLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '700' },
  reasonInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.text,
    minHeight: 64,
    textAlignVertical: 'top',
  },
  reasonCounter: { fontSize: fontSize.xs, color: colors.textMuted, alignSelf: 'flex-end' },
  reasonCounterError: { color: colors.danger, fontWeight: '700' },
  linkBtn: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '0d',
    alignItems: 'center',
  },
  linkBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  btnDisabled: { backgroundColor: colors.border },
  pressed: { opacity: 0.85 },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
});
