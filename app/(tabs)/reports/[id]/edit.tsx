import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useReportStore } from '@/stores/reportStore';
import { useAuthStore } from '@/stores/authStore';
import { safeBack } from '@/utils/backNavigation';
import { EmptyState } from '@/components/EmptyState';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { colors } from '@/theme/colors';
import { spacing, fontSize, fontWeight } from '@/theme/spacing';

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

  const cacheHas = !!detailCache[reportId];
  const [firstFetchDone, setFirstFetchDone] = useState(cacheHas);

  useEffect(() => {
    if (!reportId || cacheHas) {
      if (cacheHas) setFirstFetchDone(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      await loadDetail(reportId);
      if (!cancelled) setFirstFetchDone(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, cacheHas, loadDetail]);

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
        <EmptyState icon="document-text-outline" title="보고서를 찾을 수 없습니다" />
      </View>
    );
  }

  if (userId !== summary.creatorId) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="lock-closed-outline"
          title="수정 권한이 없습니다"
          description="작성자 본인만 수정 가능합니다"
        />
      </View>
    );
  }

  if (!report) {
    // 첫 fetch 끝났는데도 null 이면 not-found, 아니면 race 보호용 LoadingState.
    return (
      <View style={styles.container}>
        {firstFetchDone ? (
          <EmptyState
            icon="document-text-outline"
            title="보고서를 찾을 수 없습니다"
            description="삭제됐거나 접근 권한이 없는 보고서입니다"
          />
        ) : (
          <LoadingState />
        )}
      </View>
    );
  }

  const titleTrim = title.trim();
  const hasChanges =
    initialRef.current !== null && titleTrim !== initialRef.current.trim();

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
        <Input
          value={title}
          onChangeText={(v) => {
            userTouchedRef.current = true;
            setTitle(v);
            if (titleErr) setTitleErr(null);
          }}
          editable={!submitting}
          maxLength={TITLE_MAX}
          error={titleErr ?? undefined}
          helperText={titleErr ? undefined : '현장별 전·중·후 사진은 보고서 상세 화면에서 관리합니다.'}
        />

        {globalError ? <Text style={styles.error}>{globalError}</Text> : null}

        <Button
          onPress={handleSave}
          disabled={!hasChanges}
          loading={submitting}
          size="lg"
          fullWidth
          leftIcon="save"
          style={styles.submit}
        >
          {hasChanges ? '저장' : '변경 사항 없음'}
        </Button>
        <Button onPress={handleCancel} variant="ghost" size="sm" fullWidth>
          취소
        </Button>
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
    fontWeight: fontWeight.bold,
  },
  counter: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: fontWeight.semibold,
  },
  error: { color: colors.danger, fontSize: fontSize.sm, marginTop: spacing.md },
  submit: { marginTop: spacing.xl },
});
