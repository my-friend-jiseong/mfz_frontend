import { useEffect, useMemo, useState } from 'react';
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
import { useAuthStore } from '@/stores/authStore';
import { EmptyState } from '@/components/EmptyState';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

export default function EditReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const reportId = id ?? '';
  const router = useRouter();

  const allReports = useReportStore((s) => s.reports);
  const detailCache = useReportStore((s) => s.detailCache);
  const loadDetail = useReportStore((s) => s.loadDetail);
  const update = useReportStore((s) => s.update);
  const userId = useAuthStore((s) => s.user?.id);

  // 진입 시 detail 페치 (목록은 contentPreview 만 가짐)
  useEffect(() => {
    if (reportId && !detailCache[reportId]) void loadDetail(reportId);
  }, [reportId, detailCache, loadDetail]);

  const report = useMemo(
    () =>
      detailCache[reportId] ??
      allReports.find((r) => r.id === reportId && r.deletedAt === null),
    [detailCache, allReports, reportId],
  );

  const [title, setTitle] = useState(report?.title ?? '');
  const [content, setContent] = useState(report?.content ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // detail 페치 완료 시 입력 필드를 풀 본문으로 채움 (preview 가 아닌)
  useEffect(() => {
    if (report) {
      setTitle((prev) => (prev ? prev : report.title));
      setContent((prev) => (prev ? prev : report.content));
    }
  }, [report]);

  if (!report) {
    return (
      <View style={styles.container}>
        <EmptyState title="보고서를 찾을 수 없습니다" />
      </View>
    );
  }

  if (userId !== report.creatorId) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="수정 권한이 없습니다"
          description="작성자 본인만 수정 가능합니다"
        />
      </View>
    );
  }

  const handleSave = async () => {
    setError(null);
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
    const r = await update(report.id, { title: t, content: c });
    setSubmitting(false);
    if (r.ok) {
      router.back();
    } else {
      Alert.alert('수정 실패', r.error);
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
        <Text style={styles.label}>제목 *</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={styles.input}
          maxLength={100}
        />

        <Text style={styles.label}>본문 * (10~50,000자)</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          style={[styles.input, styles.multiline]}
          multiline
          maxLength={50000}
        />
        <Text style={styles.counter}>{content.length} / 50,000</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleSave}
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
  multiline: { minHeight: 200, textAlignVertical: 'top' },
  counter: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    alignSelf: 'flex-end',
    marginTop: spacing.xs,
  },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
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
