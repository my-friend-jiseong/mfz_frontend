import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { reports as reportsApi, type ReportCreateData, localizeError } from '@/api';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// 비로그인 사용자도 토큰만 알면 보고서 미리보기 가능 (skipAuth 호출).
// expo-router 의 정적 라우트 — 별도 인증 가드 없이 진입.

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR');
}

export default function SharedReport() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [report, setReport] = useState<ReportCreateData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await reportsApi.getShared(token);
        setReport(data);
      } catch (e) {
        setError(localizeError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !report) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>공유 링크를 열 수 없습니다</Text>
        <Text style={styles.errorBody}>{error ?? '만료되었거나 잘못된 링크입니다'}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>공유 보기 (읽기 전용)</Text>
      </View>
      <Text style={styles.title}>{report.title}</Text>
      {report.summary ? (
        <Text style={styles.summary}>{report.summary}</Text>
      ) : null}
      <Text style={styles.meta}>
        작성: {fmtDateTime(report.createdAt)}
        {report.updatedAt && report.updatedAt !== report.createdAt
          ? ` · 수정: ${fmtDateTime(report.updatedAt)}`
          : ''}
      </Text>

      <View style={styles.contentBox}>
        <Text style={styles.content}>{report.content}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  errorTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  errorBody: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
  },
  summary: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
  meta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  contentBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  content: {
    fontSize: fontSize.base,
    color: colors.text,
    lineHeight: 22,
  },
});
