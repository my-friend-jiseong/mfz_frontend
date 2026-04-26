import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useAuthStore } from '@/stores/authStore';
import { API_BASE_URL } from '@/api';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR');
}

export default function ReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const reportId = id ?? '';
  const router = useRouter();

  const allReports = useReportStore((s) => s.reports);
  const detailCache = useReportStore((s) => s.detailCache);
  const loadDetail = useReportStore((s) => s.loadDetail);
  const remove = useReportStore((s) => s.remove);
  const share = useReportStore((s) => s.share);
  const allTrips = useTripStore((s) => s.trips);
  const userId = useAuthStore((s) => s.user?.id);

  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const disableShare = useReportStore((s) => s.disableShare);

  // 진입 시 백엔드에서 detail 페치 (목록은 contentPreview 만 갖고 있음).
  // 단, 삭제 진행 중이면 호출하지 않음 — 삭제 후 router.replace 까지 한 프레임 동안
  // 동일 화면이 잔존해 detail 재페치 → 404 → 비직관적 오류가 뜨던 문제 방지.
  useEffect(() => {
    if (reportId && !deleting) void loadDetail(reportId);
  }, [reportId, loadDetail, deleting]);

  const report = useMemo(
    () =>
      detailCache[reportId] ??
      allReports.find((r) => r.id === reportId && r.deletedAt === null),
    [detailCache, allReports, reportId],
  );
  const trip = useMemo(
    () => (report ? allTrips.find((t) => t.id === report.tripId) : undefined),
    [allTrips, report],
  );

  if (!report) {
    return (
      <MapSheetLayout title="보고서 상세" onBack={() => router.back()}>
        <EmptyState
          title={deleting ? '보고서를 삭제 중입니다...' : '보고서를 찾을 수 없습니다'}
        />
      </MapSheetLayout>
    );
  }

  const isOwner = userId === report.creatorId;

  const handleDelete = () => {
    const doDelete = async () => {
      setDeleting(true); // race 가드 — 삭제 중 detail 재페치 차단
      const r = await remove(report.id);
      if (r.ok) {
        // 성공 시 보고서 목록으로 이동. setDeleting(false) 는 unmount 되므로 불필요.
        router.replace('/(tabs)/reports' as never);
        return;
      }
      setDeleting(false);
      // 친절한 메시지 분기
      const raw = r.error || '';
      let msg = '보고서를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.';
      if (/not_found|404/i.test(raw)) {
        msg = '이미 삭제되었거나 찾을 수 없는 보고서입니다.';
        // 이미 없는 보고서면 그냥 목록으로
        router.replace('/(tabs)/reports' as never);
        return;
      } else if (/forbidden|403/i.test(raw)) {
        msg = '본인 작성 보고서만 삭제할 수 있습니다.';
      } else if (/network|연결/i.test(raw)) {
        msg = '네트워크 연결을 확인해주세요.';
      } else if (raw && !/^\s*$/.test(raw)) {
        msg = `보고서를 삭제하지 못했습니다.\n${raw}`;
      }
      Alert.alert('보고서 삭제 실패', msg);
    };
    if (Platform.OS === 'web') {
      if (confirm('이 보고서를 삭제할까요?')) void doDelete();
    } else {
      Alert.alert('보고서 삭제', '이 보고서를 정말 삭제할까요?', [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: () => void doDelete() },
      ]);
    }
  };

  const handleShare = async () => {
    setSharing(true);
    const r = await share(report.id);
    setSharing(false);
    if (!r.ok) {
      Alert.alert('공유 링크 발급 실패', r.error);
      return;
    }
    const url = `${API_BASE_URL}${r.share.shareUrl}`;
    setShareUrl(url);
    setShareExpiresAt(r.share.expiresAt ?? r.share.shareExpiresAt ?? null);
    try {
      await Clipboard.setStringAsync(url);
      Alert.alert(
        '공유 링크',
        '링크가 클립보드에 복사되었습니다.\n비로그인 사용자도 이 링크로 미리보기 가능합니다.',
      );
    } catch {
      Alert.alert('공유 링크', url);
    }
  };

  const handleDisableShare = async () => {
    setSharing(true);
    const r = await disableShare(report.id);
    setSharing(false);
    if (r.ok) {
      setShareUrl(null);
      setShareExpiresAt(null);
      Alert.alert('공유 해제', '이 보고서의 공유 링크가 무효화되었습니다.');
    } else {
      Alert.alert('공유 해제 실패', r.error);
    }
  };

  return (
    <MapSheetLayout
      title="보고서 상세"
      onBack={() => router.back()}
      initialIndex={2}
    >
      <BottomSheetScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{report.title}</Text>

        {trip ? (
          <Pressable
            onPress={() => router.push(`/(tabs)/trips/${trip.id}` as never)}
            style={styles.tripLink}
          >
            <Text style={styles.tripLinkText}>
              연결 외근: #{trip.id} · {fmtDateTime(trip.startedAt)}
            </Text>
          </Pressable>
        ) : null}

        <Text style={styles.meta}>
          작성: {fmtDateTime(report.createdAt)}
          {report.updatedAt ? ` · 수정: ${fmtDateTime(report.updatedAt)}` : ''}
        </Text>

        <View style={styles.contentBox}>
          <Text style={styles.content}>{report.content}</Text>
        </View>

        {isOwner ? (
          <>
            <View style={styles.actions}>
              <Pressable
                onPress={() =>
                  router.push(`/(tabs)/reports/${report.id}/edit` as never)
                }
                style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
              >
                <Text style={styles.actionText}>수정</Text>
              </Pressable>
              <Pressable
                onPress={handleShare}
                disabled={sharing}
                style={({ pressed }) => [
                  styles.actionBtn,
                  (pressed || sharing) && styles.pressed,
                ]}
              >
                <Text style={styles.actionText}>{sharing ? '공유 중...' : '공유'}</Text>
              </Pressable>
              <Pressable
                onPress={handleDelete}
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.dangerBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.actionText, styles.dangerText]}>삭제</Text>
              </Pressable>
            </View>
            {shareUrl ? (
              <View style={styles.shareUrlBox}>
                <Text style={styles.shareUrlLabel}>발급된 공유 링크</Text>
                <Text style={styles.shareUrlText} selectable>
                  {shareUrl}
                </Text>
                {shareExpiresAt ? (
                  <Text style={styles.shareExpires}>
                    만료: {fmtDateTime(shareExpiresAt)}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => void handleDisableShare()}
                  disabled={sharing}
                  style={({ pressed }) => [
                    styles.shareDisableBtn,
                    (pressed || sharing) && styles.pressed,
                  ]}
                >
                  <Text style={styles.shareDisableText}>공유 해제</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        ) : null}
      </BottomSheetScrollView>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: colors.text,
  },
  tripLink: {
    marginTop: spacing.sm,
    backgroundColor: colors.primary + '10',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignSelf: 'flex-start',
  },
  tripLinkText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '600' },
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  actionText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  dangerBtn: { borderColor: colors.danger + '40' },
  dangerText: { color: colors.danger },
  pressed: { opacity: 0.85 },
  shareUrlBox: {
    marginTop: spacing.md,
    backgroundColor: colors.primary + '10',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  shareUrlLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.primary,
  },
  shareUrlText: {
    fontSize: fontSize.xs,
    color: colors.text,
    marginTop: spacing.xs,
  },
  shareExpires: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  shareDisableBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger + '55',
    alignSelf: 'flex-start',
  },
  shareDisableText: {
    fontSize: fontSize.xs,
    color: colors.danger,
    fontWeight: '700',
  },
});
