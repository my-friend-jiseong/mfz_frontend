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
import { EmptyState } from '@/components/EmptyState';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

const TITLE_MAX = 100;
const CONTENT_MIN = 10;
const CONTENT_MAX = 50_000;

interface FieldErrors {
  title?: string;
  content?: string;
}

// 백엔드 code → 필드 매핑.
const CODE_TO_FIELD: Record<string, keyof FieldErrors> = {
  report_title_required: 'title',
  report_title_length_invalid: 'title',
  report_title_content_required: 'title',
  report_content_required: 'content',
  report_content_length_invalid: 'content',
};

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

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // initial 값 보존 — 변경 감지 / 뒤로 가기 confirm 용.
  const initialRef = useRef<{ title: string; content: string } | null>(null);

  // detail 페치 완료 시 입력 필드를 풀 본문으로 채움 — 한 번만 (사용자 입력 보존).
  useEffect(() => {
    if (!report || initialRef.current) return;
    setTitle(report.title);
    setContent(report.content);
    initialRef.current = { title: report.title, content: report.content };
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

  const titleTrim = title.trim();
  const contentTrim = content.trim();
  const hasChanges =
    !!initialRef.current &&
    (titleTrim !== initialRef.current.title.trim() ||
      contentTrim !== initialRef.current.content.trim());

  const validate = (): FieldErrors => {
    const errs: FieldErrors = {};
    if (titleTrim.length < 1) errs.title = '제목을 입력해주세요';
    else if (titleTrim.length > TITLE_MAX) errs.title = `제목은 ${TITLE_MAX}자 이하여야 합니다`;
    if (contentTrim.length < CONTENT_MIN) errs.content = `본문은 ${CONTENT_MIN}자 이상이어야 합니다`;
    else if (contentTrim.length > CONTENT_MAX)
      errs.content = `본문은 ${CONTENT_MAX.toLocaleString()}자 이하여야 합니다`;
    return errs;
  };

  const clearFieldErr = (k: keyof FieldErrors) =>
    setFieldErrors((p) => ({ ...p, [k]: undefined }));

  const handleSave = async () => {
    setGlobalError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    const r = await update(report.id, { title: titleTrim, content: contentTrim });
    setSubmitting(false);
    if (r.ok) {
      router.back();
      return;
    }
    // 백엔드 코드 → 필드 매핑.
    const code =
      typeof (r as { code?: string }).code === 'string'
        ? (r as { code?: string }).code
        : null;
    if (code && CODE_TO_FIELD[code]) {
      setFieldErrors({ [CODE_TO_FIELD[code]]: r.error });
      return;
    }
    setGlobalError(r.error);
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
            setTitle(v);
            if (fieldErrors.title) clearFieldErr('title');
          }}
          editable={!submitting}
          style={[styles.input, fieldErrors.title && styles.inputError]}
          maxLength={TITLE_MAX}
        />
        {fieldErrors.title ? (
          <Text style={styles.fieldError}>{fieldErrors.title}</Text>
        ) : null}

        <View style={styles.labelRow}>
          <Text style={styles.label}>본문 * ({CONTENT_MIN}자 이상)</Text>
          <Text style={styles.counter}>
            {content.length.toLocaleString()} / {CONTENT_MAX.toLocaleString()}
          </Text>
        </View>
        <TextInput
          value={content}
          onChangeText={(v) => {
            setContent(v);
            if (fieldErrors.content) clearFieldErr('content');
          }}
          editable={!submitting}
          style={[styles.input, styles.multiline, fieldErrors.content && styles.inputError]}
          multiline
          maxLength={CONTENT_MAX}
        />
        {fieldErrors.content ? (
          <Text style={styles.fieldError}>{fieldErrors.content}</Text>
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
  multiline: { minHeight: 200, textAlignVertical: 'top' },
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
