import { useEffect, useMemo, useRef, useState } from 'react';
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
import { safeBack } from '@/utils/backNavigation';
import { EmptyState } from '@/components/EmptyState';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// ERD v2: 보고서 본문(content) 제거 — 제목만 편집. 본문은 현장별 전·중·후 사진(field_reports).
const TITLE_MAX = 100;

export default function EditReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const reportId = id ?? '';
  const router = useRouter();

  const allReports = useReportStore((s) => s.reports);
  const detailCache = useReportStore((s) => s.detailCache);
  const loadDetail = useReportStore((s) => s.loadDetail);
  const update = useReportStore((s) => s.update);
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (reportId && !detailCache[reportId]) void loadDetail(reportId);
  }, [reportId, detailCache, loadDetail]);

  const report = detailCache[reportId];
  const summary = useMemo(
    () => report ?? allReports.find((r) => r.id === reportId),
    [allReports, report, reportId],
  );

  const [title, setTitle] = useState('');
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initialRef = useRef<string | null>(null);
  const userTouchedRef = useRef(false);

  useEffect(() => {
    if (!report || initialRef.current) return;
    if (!userTouchedRef.current) setTitle(report.title);
    initialRef.current = report.title;
  }, [report]);

  if (!summary) {
    return (
      <View style={styles.container}>
        <EmptyState title="보고서를 찾을 수 없습니다" />
      </View>
    );
  }

  if (userId !== summary.creatorId) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="수정 권한이 없습니다"
          description="작성자 본인만 수정 가능합니다"
        />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.container}>
        <EmptyState title="불러오는 중..." />
      </View>
    );
  }

  const titleTrim = title.trim();
  const hasChanges = initialRef.current !== null && titleTrim !== initialRef.current.trim();

  const handleSave = async () => {
    setGlobalError(null);
    if (titleTrim.length < 1) {
      setTitleErr('제목을 입력해주세요');
      return;
    }
    if (titleTrim.length > TITLE_MAX) {
      setTitleErr(`제목은 ${TITLE_MAX}자 이하여야 합니다`);
      return;
    }
    setSubmitting(true);
    const r = await update(report.id, { title: titleTrim });
    setSubmitting(false);
    if (r.ok) {
      safeBack(router);
      return;
    }
    const code = (r as { code?: string }).code;
    if (code === 'report_title_required' || code === 'report_title_length_invalid') {
      setTitleErr(r.error);
      return;
    }
    setGlobalError(r.error);
  };

  const handleCancel = () => {
    if (!hasChanges) {
      safeBack(router);
      return;
    }
    Alert.alert('수정 취소', '저장하지 않은 변경 사항이 있습니다. 계속 취소할까요?', [
      { text: '계속 작성', style: 'cancel' },
      { text: '버리고 나가기', style: 'destructive', onPress: () => safeBack(router) },
    ]);
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
        <View style={styles.labelRow}>
          <Text style={styles.label}>제목 *</Text>
          <Text style={styles.counter}>
            {title.length} / {TITLE_MAX}
          </Text>
        </View>
        <TextInput
          value={title}
          onChangeText={(v) => {
            userTouchedRef.current = true;
            setTitle(v);
            if (titleErr) setTitleErr(null);
          }}
          editable={!submitting}
          style={[styles.input, titleErr && styles.inputError]}
          maxLength={TITLE_MAX}
        />
        {titleErr ? <Text style={styles.fieldError}>{titleErr}</Text> : null}

        <Text style={styles.hint}>
          현장별 전·중·후 사진은 보고서 상세 화면에서 관리합니다.
        </Text>

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '700',
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
  inputError: { borderColor: colors.danger },
  counter: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  fieldError: {
    color: colors.danger,
    fontSize: fontSize.xs,
    marginTop: 4,
    marginLeft: 4,
  },
  hint: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
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
  pressed: { opacity: 0.85 },
  cancel: { alignItems: 'center', paddingVertical: spacing.md },
  cancelText: { color: colors.textMuted, fontSize: fontSize.sm },
});
