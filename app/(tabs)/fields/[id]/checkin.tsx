import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { safeBack } from '@/utils/backNavigation';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useDestinationStore } from '@/stores/destinationStore';
import {
  VISIT_STATUS_VALUES,
  VISIT_STATUS_LABEL,
  type VisitStatus,
} from '@/types/entities';
import { EmptyState } from '@/components/EmptyState';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { withAlpha } from '@/theme/withAlpha';

// ERD v2: 체크인은 방문 기록(trip·field·시각·status)만 생성. 메모·사진·음성 첨부는
// 현장(field) 상세에서 관리.

// visit status → 색·형상 매핑 (3중 인코딩).
const VISIT_SHAPE: Record<VisitStatus, string> = {
  completed: '■',
  absent: '●',
  refused: '▲',
  unknown_address: '◆',
  revisit_needed: '◆',
  other: '◆',
};

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
    return (
      <View style={styles.container}>
        <EmptyState
          icon="search-outline"
          title="현장을 찾을 수 없습니다"
          action={
            <Button
              onPress={() => router.replace('/(tabs)/fields' as never)}
              variant="secondary"
              leftIcon="arrow-back"
            >
              현장 목록으로
            </Button>
          }
        />
      </View>
    );
  }

  if (activeTripId === null) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="briefcase-outline"
          title="외근 시작 후 체크인 가능합니다"
          description="외근 탭에서 외근을 시작해주세요"
          action={
            <Button
              onPress={() => router.replace('/(tabs)/trips' as never)}
              leftIcon="briefcase"
            >
              외근 탭으로
            </Button>
          }
        />
      </View>
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
        <Card padding="lg" style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
            <Text variant="bodySm" weight="bold" color="primary">
              체크인 완료
            </Text>
          </View>
          <Text variant="body" weight="semibold" style={styles.headerSub}>
            {field.address}
          </Text>
          {field.addressDetail ? (
            <Text variant="bodySm" color="textMuted" style={styles.headerSubMuted}>
              {field.addressDetail}
            </Text>
          ) : null}
        </Card>

        <Text variant="bodySm" weight="bold" color="textMuted" style={styles.sectionTitle}>
          방문 결과 상태
        </Text>
        <View style={styles.statusGrid}>
          {VISIT_STATUS_VALUES.map((s) => {
            const active = status === s;
            const c = colors.visitStatus[s];
            return (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={({ pressed }) => [
                  styles.statusChip,
                  active && { backgroundColor: withAlpha(c, 0.13), borderColor: c },
                  pressed && { opacity: opacity.pressed },
                ]}
              >
                <Text
                  variant="caption"
                  style={[
                    { lineHeight: 12 },
                    active ? { color: c } : { color: colors.textSubtle },
                  ]}
                >
                  {VISIT_SHAPE[s]}
                </Text>
                <Text
                  variant="bodySm"
                  weight={active ? 'bold' : 'regular'}
                  style={active ? { color: c } : { color: colors.textMuted }}
                >
                  {VISIT_STATUS_LABEL[s]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {status === 'other' ? (
          <Input
            label="기타 사유 (10자 이상 필수)"
            value={reason}
            onChangeText={setReason}
            placeholder="현장 상황을 10자 이상 설명해주세요"
            maxLength={500}
            multiline
            numberOfLines={3}
            style={styles.reasonField}
            helperText={`${reasonTrim.length} / 10자 이상`}
            error={reasonTrim.length > 0 && reasonTrim.length < 10 ? `${reasonTrim.length} / 10자 이상 필요` : undefined}
            containerStyle={styles.reasonBox}
          />
        ) : null}

        <Button
          onPress={() => router.push(`/(tabs)/fields/${fieldId}` as never)}
          variant="secondary"
          fullWidth
          rightIcon="arrow-forward"
          style={styles.toField}
        >
          메모·사진 추가
        </Button>

        <Button
          onPress={handleSaveResult}
          disabled={!visitId || !otherReasonValid}
          loading={saving}
          size="lg"
          fullWidth
          leftIcon="save"
          style={styles.submit}
        >
          결과 저장하고 완료
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  header: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 0,
    marginBottom: spacing.lg,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerSub: { marginTop: spacing.xs },
  headerSubMuted: { marginTop: 2 },
  sectionTitle: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reasonBox: { marginTop: spacing.md },
  reasonField: { minHeight: 72, textAlignVertical: 'top' },
  toField: { marginTop: spacing.xl },
  submit: { marginTop: spacing.md },
});
