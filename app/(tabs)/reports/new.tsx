import { useMemo, useState } from 'react';
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
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function NewReport() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const userId = useAuthStore((s) => s.user?.id);
  const create = useReportStore((s) => s.create);
  const allReports = useReportStore((s) => s.reports);
  const allTrips = useTripStore((s) => s.trips);

  const initialTripId = params.tripId ?? null;
  const [tripId, setTripId] = useState<string | null>(initialTripId);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const myTrips = useMemo(() => {
    if (!userId) return [];
    return allTrips
      .filter((t) => t.workerId === userId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }, [allTrips, userId]);

  // 같은 외근 안 동일 제목 경고 (차단 아님)
  const dupWarning = useMemo(() => {
    if (!tripId || !title.trim()) return null;
    const dup = allReports.some(
      (r) =>
        r.tripId === tripId &&
        r.deletedAt === null &&
        r.title.trim() === title.trim(),
    );
    return dup ? '이 외근에 같은 제목의 보고서가 이미 있습니다.' : null;
  }, [allReports, tripId, title]);

  const handleSubmit = async () => {
    setError(null);
    setWarn(null);
    if (!userId) return;
    const t = title.trim();
    const c = content.trim();
    if (t.length < 1 || t.length > 100) {
      setError('제목은 1~100자로 입력해주세요');
      return;
    }
    if (c.length < 10 || c.length > 50000) {
      setError('본문은 10~50,000자로 입력해주세요');
      return;
    }
    setSubmitting(true);
    const result = await create({
      title: t,
      content: c,
      summary: summary.trim() || undefined,
      tripId: tripId ?? undefined,
    });
    setSubmitting(false);
    if (result.ok) {
      router.replace(`/(tabs)/reports/${result.report.id}` as never);
    } else {
      Alert.alert('보고서 생성 실패', result.error);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>연결할 외근 (선택)</Text>
        {myTrips.length === 0 ? (
          <Text style={styles.hint}>
            등록된 외근이 없습니다. 외근 탭에서 외근을 먼저 시작·종료해주세요.
          </Text>
        ) : (
          <View style={styles.tripList}>
            {myTrips.map((t) => {
              const active = t.id === tripId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTripId(t.id)}
                  style={[styles.tripItem, active && styles.tripItemActive]}
                >
                  <Text
                    style={[
                      styles.tripItemText,
                      active && styles.tripItemTextActive,
                    ]}
                  >
                    {fmtDate(t.startedAt)} · #{t.id}
                    {t.endedAt ? '' : ' · 진행 중'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.label}>제목 *</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={styles.input}
          placeholder="예: 4/20 해운대 현장 외근 최종 보고"
          maxLength={100}
        />
        {dupWarning ? <Text style={styles.warn}>{dupWarning}</Text> : null}

        <Text style={styles.label}>본문 * (10~50,000자)</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          style={[styles.input, styles.multiline]}
          placeholder="외근 결과·특이사항·후속 조치 등 작성"
          multiline
          maxLength={50000}
        />
        <Text style={styles.counter}>{content.length} / 50,000</Text>

        <Text style={styles.label}>요약 (선택)</Text>
        <TextInput
          value={summary}
          onChangeText={setSummary}
          style={styles.input}
          placeholder="한 줄 요약 — 목록·공유 시 노출"
          maxLength={200}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {warn ? <Text style={styles.warn}>{warn}</Text> : null}

        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={({ pressed }) => [styles.btn, (pressed || submitting) && styles.pressed]}
        >
          <Text style={styles.btnText}>{submitting ? '저장 중...' : '저장'}</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.cancel}>
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  hint: { fontSize: fontSize.sm, color: colors.textMuted },
  tripList: { gap: spacing.xs },
  tripItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tripItemActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  tripItemText: { fontSize: fontSize.sm, color: colors.text },
  tripItemTextActive: { color: colors.primary, fontWeight: '700' },
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
  multiline: { minHeight: 180, textAlignVertical: 'top' },
  counter: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
  },
  error: {
    color: colors.danger,
    fontSize: fontSize.sm,
    marginTop: spacing.md,
  },
  warn: {
    color: colors.warning,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  btn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  btnText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { color: colors.textMuted, fontSize: fontSize.sm },
});
