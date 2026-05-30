import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { useVisitStore } from '@/stores/visitStore';
import { safeBack } from '@/utils/backNavigation';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import { opacity } from '@/theme/motion';
import { fmtDate, fmtTime } from '@/utils/datetime';

// 새 양식(2026-05-31 결정) — 본문/AI/보고서 레벨 사진 제거.
// 제목 + 외근 선택 → 그 외근의 visits 마다 빈 FieldReport 자동 스캐폴드 → 상세로 이동.

export default function ComposeReport() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();

  const createWithVisitScaffold = useReportStore((s) => s.createWithVisitScaffold);
  const allTrips = useTripStore((s) => s.trips);
  const loadTripDetail = useTripStore((s) => s.loadDetail);
  const userId = useAuthStore((s) => s.user?.id);
  const allVisits = useVisitStore((s) => s.visits);

  const [tripId, setTripId] = useState<string | null>(params.tripId ?? null);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 선택된 외근의 detail (visits) 동기화 — 스캐폴드 fieldId 정확도를 위해.
  useEffect(() => {
    if (tripId) void loadTripDetail(tripId);
  }, [tripId, loadTripDetail]);

  const myTrips = useMemo(() => {
    if (!userId) return [];
    return allTrips
      .filter((t) => t.workerId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [allTrips, userId]);

  const selectedTrip = useMemo(
    () => (tripId ? myTrips.find((t) => t.id === tripId) ?? null : null),
    [myTrips, tripId],
  );

  // 선택 외근의 visits — 자동 스캐폴드 대상.
  const tripVisits = useMemo(() => {
    if (!tripId) return [];
    return allVisits
      .filter((v) => v.tripId === tripId)
      .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt));
  }, [tripId, allVisits]);

  const scaffoldFieldIds = useMemo(
    () => tripVisits.map((v) => v.fieldId).filter(Boolean),
    [tripVisits],
  );

  const handleSubmit = async () => {
    setError(null);
    const t = title.trim();
    if (t.length < 1 || t.length > 100) {
      setError('제목은 1~100자로 입력해주세요');
      return;
    }
    if (!tripId) {
      setError('외근을 선택해주세요');
      return;
    }
    setSubmitting(true);
    const r = await createWithVisitScaffold({ title: t, tripId }, scaffoldFieldIds);
    setSubmitting(false);
    if (r.ok) {
      router.replace(`/(tabs)/reports/${r.report.id}` as never);
    } else {
      Alert.alert('보고서 생성 실패', r.error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => safeBack(router)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="뒤로 가기"
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: opacity.pressed }]}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Text variant="h3" weight="heavy">
            보고서 작성
          </Text>
        </View>

        <Input
          label="제목"
          value={title}
          onChangeText={setTitle}
          placeholder="예: 2026-05-31 사하구 가로수 보수"
          maxLength={100}
          containerStyle={styles.titleField}
        />

        <Text variant="bodySm" weight="bold" color="textMuted" style={styles.label}>
          연결 외근
        </Text>
        {selectedTrip ? (
          <Card padding="md" style={styles.tripCard}>
            <View style={styles.tripCardHead}>
              <Ionicons name="briefcase" size={16} color={colors.primary} />
              <Text variant="body" weight="semibold" style={styles.tripCardTitle}>
                {selectedTrip.title || `${fmtDate(selectedTrip.startedAt)} 외근`}
              </Text>
            </View>
            <Text variant="caption" color="textMuted" style={styles.tripCardMeta}>
              {fmtDate(selectedTrip.startedAt)} {fmtTime(selectedTrip.startedAt)}
              {selectedTrip.endedAt ? ` ~ ${fmtTime(selectedTrip.endedAt)}` : ' · 진행 중'}
              {' · 방문 '}{tripVisits.length}건
            </Text>
            {/* params.tripId 가 있으면 외근이 외부에서 지정된 동선 — picker 잠금. 아니면 변경 가능. */}
            {!params.tripId ? (
              <Button
                onPress={() => setTripPickerOpen(true)}
                variant="ghost"
                size="sm"
                leftIcon="swap-horizontal"
                style={styles.changeBtn}
              >
                외근 변경
              </Button>
            ) : null}
          </Card>
        ) : (
          <Button
            onPress={() => setTripPickerOpen(true)}
            variant="secondary"
            fullWidth
            leftIcon="briefcase-outline"
            style={styles.pickTripBtn}
          >
            외근 선택
          </Button>
        )}

        {selectedTrip && scaffoldFieldIds.length > 0 ? (
          <Text variant="caption" color="textMuted" style={styles.scaffoldHint}>
            보고서 생성 시 방문한 현장 {scaffoldFieldIds.length}곳에 대한 빈 현장 보고가
            자동으로 만들어집니다. 사진·캡션은 상세 화면에서 채울 수 있어요.
          </Text>
        ) : selectedTrip ? (
          <Text variant="caption" color="textMuted" style={styles.scaffoldHint}>
            이 외근은 방문 기록이 없어 현장 보고가 자동 생성되지 않습니다.
            보고서 생성 후 상세 화면에서 직접 추가할 수 있어요.
          </Text>
        ) : null}

        {error ? (
          <Text variant="bodySm" color="danger" style={styles.error}>
            {error}
          </Text>
        ) : null}

        <Button
          onPress={handleSubmit}
          disabled={!tripId || !title.trim() || submitting}
          loading={submitting}
          size="lg"
          fullWidth
          leftIcon="document-text"
          style={styles.submitBtn}
        >
          보고서 만들기
        </Button>
      </ScrollView>

      <Modal
        visible={tripPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTripPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setTripPickerOpen(false)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text variant="body" weight="bold" style={styles.modalTitle}>
              연결할 외근 선택
            </Text>
            <ScrollView style={styles.modalList}>
              {myTrips.map((t) => {
                const visitCount = allVisits.reduce(
                  (n, v) => (v.tripId === t.id ? n + 1 : n),
                  0,
                );
                const active = t.id === tripId;
                return (
                  <Pressable
                    key={t.id}
                    onPress={() => {
                      setTripId(t.id);
                      setTripPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.modalItem,
                      active && styles.modalItemActive,
                      pressed && { opacity: opacity.pressed },
                    ]}
                  >
                    <View style={styles.modalItemHead}>
                      <Ionicons
                        name={active ? 'radio-button-on' : 'radio-button-off'}
                        size={16}
                        color={active ? colors.primary : colors.textMuted}
                      />
                      <Text variant="body" weight="semibold" style={styles.modalItemTitle}>
                        {t.title || `${fmtDate(t.startedAt)} 외근`}
                      </Text>
                    </View>
                    <Text variant="caption" color="textMuted" style={styles.modalItemMeta}>
                      {fmtDate(t.startedAt)} {fmtTime(t.startedAt)}
                      {t.endedAt ? ` ~ ${fmtTime(t.endedAt)}` : ' · 진행 중'}
                      {' · 방문 '}{visitCount}건
                    </Text>
                  </Pressable>
                );
              })}
              {myTrips.length === 0 ? (
                <Text variant="bodySm" color="textMuted" style={styles.modalEmpty}>
                  작성된 외근이 없습니다.
                </Text>
              ) : null}
            </ScrollView>
            <Button
              onPress={() => setTripPickerOpen(false)}
              variant="ghost"
              fullWidth
              style={styles.modalClose}
            >
              닫기
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl * 2 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  backBtn: { padding: 2 },
  titleField: { marginBottom: spacing.md },
  label: { marginTop: spacing.md, marginBottom: spacing.xs },
  tripCard: { gap: spacing.xs },
  tripCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tripCardTitle: { flex: 1 },
  tripCardMeta: { marginTop: 2 },
  changeBtn: { alignSelf: 'flex-start', marginTop: spacing.xs },
  pickTripBtn: { marginTop: spacing.xs },
  scaffoldHint: { marginTop: spacing.md },
  error: { marginTop: spacing.sm },
  submitBtn: { marginTop: spacing.xl },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  modalTitle: { marginBottom: spacing.md },
  modalList: { maxHeight: 420 },
  modalItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    gap: 4,
  },
  modalItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  modalItemHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  modalItemTitle: { flex: 1 },
  modalItemMeta: { paddingLeft: 24 },
  modalEmpty: { padding: spacing.lg, textAlign: 'center' },
  modalClose: { marginTop: spacing.sm },
});
