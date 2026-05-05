import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { reports as reportsApi, type ReportCreateData, localizeError, errorCode } from '@/api';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// 비로그인 사용자도 토큰만 알면 보고서 미리보기 가능 (skipAuth 호출).
// expo-router 의 정적 라우트 — 별도 인증 가드 없이 진입.

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR');
}

type ShareErrorKind = 'expired' | 'disabled' | 'not_found' | 'generic';

export default function SharedReport() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [report, setReport] = useState<ReportCreateData | null>(null);
  const [error, setError] = useState<{ kind: ShareErrorKind; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await reportsApi.getShared(token);
        setReport(data);
      } catch (e) {
        const code = errorCode(e);
        const kind: ShareErrorKind =
          code === 'share_expired' ? 'expired'
            : code === 'share_not_enabled' ? 'disabled'
            : code === 'report_not_found' ? 'not_found'
            : 'generic';
        setError({ kind, message: localizeError(e) });
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
    const titleByKind: Record<ShareErrorKind, string> = {
      expired: '공유 링크가 만료되었습니다',
      disabled: '공유가 해제된 보고서입니다',
      not_found: '존재하지 않는 보고서입니다',
      generic: '공유 링크를 열 수 없습니다',
    };
    const helpByKind: Record<ShareErrorKind, string> = {
      expired: '공유자에게 새 링크 발급을 요청해주세요.',
      disabled: '공유자가 공유를 중지했습니다.',
      not_found: '잘못된 링크이거나 보고서가 삭제되었습니다.',
      generic: '잠시 후 다시 시도해주세요.',
    };
    const kind: ShareErrorKind = error?.kind ?? 'generic';
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>{titleByKind[kind]}</Text>
        <Text style={styles.errorBody}>{error?.message ?? '만료되었거나 잘못된 링크입니다'}</Text>
        <Text style={styles.errorHelp}>{helpByKind[kind]}</Text>
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
  errorHelp: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    fontStyle: 'italic',
  },
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
