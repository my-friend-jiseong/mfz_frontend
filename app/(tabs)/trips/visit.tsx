import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { visits as visitsApi, localizeError } from '@/api';
import type { VisitDetailResponse } from '@/api';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { PhotoGrid, VoiceMemoList } from '@/components/AttachmentPreview';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR');
}

export default function VisitDetail() {
  const router = useRouter();
  const { tripId, visitId } = useLocalSearchParams<{
    tripId: string;
    visitId: string;
  }>();

  const [data, setData] = useState<VisitDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeTripId = useTripStore((s) => s.activeTripId);
  const visitInStore = useVisitStore((s) => s.getById)(visitId ?? '');

  useEffect(() => {
    if (!tripId || !visitId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await visitsApi.detail(tripId, visitId);
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError(localizeError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, visitId]);

  if (loading) {
    return (
      <MapSheetLayout title="방문 상세" onBack={() => router.back()}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </MapSheetLayout>
    );
  }

  if (error || !data) {
    return (
      <MapSheetLayout title="방문 상세" onBack={() => router.back()}>
        <EmptyState title="방문을 찾을 수 없습니다" description={error ?? undefined} />
      </MapSheetLayout>
    );
  }

  const attachments = data.attachments ?? [];
  const textMemos = attachments.filter((a) => a.type === 'text');
  const photos = attachments
    .filter((a) => a.type === 'photo' && (a.fileUrl ?? a.url))
    .map((a) => ({ id: a.id, fileUrl: (a.fileUrl ?? a.url) as string }));
  const voices = attachments
    .filter((a) => a.type === 'audio' && (a.fileUrl ?? a.url))
    .map((a) => ({
      id: a.id,
      fileUrl: (a.fileUrl ?? a.url) as string,
      durationSec: a.durationSec ?? a.durationSeconds,
      createdAt: a.createdAt,
    }));
  // colors.visitStatus 는 visit.status (completed/absent/...) 키 — resultStatus
  // (normal/abnormal) 와 다름. status 로 조회.
  const statusColor =
    colors.visitStatus[data.status as keyof typeof colors.visitStatus] ?? colors.text;
  // 활성 외근의 visit 일 때만 "추가 첨부" CTA 노출 (이미 종료된 외근은 view-only).
  const canAddMore =
    activeTripId !== null && data.tripId === activeTripId && !!visitInStore;
  const fieldIdForCheckin = visitInStore?.fieldId ?? null;

  return (
    <MapSheetLayout title="방문 상세" onBack={() => router.back()} initialIndex={2}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.site}>{data.siteName}</Text>
        <View style={[styles.statusChip, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{data.status}</Text>
        </View>
        <Text style={styles.meta}>방문 시각: {fmtDateTime(data.visitedAt)}</Text>
        {data.statusReason ? (
          <Text style={styles.reason}>사유: {data.statusReason}</Text>
        ) : null}

        <View style={styles.summaryRow}>
          <SummaryBadge label="텍스트" count={textMemos.length} />
          <SummaryBadge label="사진" count={photos.length} />
          <SummaryBadge label="음성" count={voices.length} />
        </View>

        {canAddMore && fieldIdForCheckin ? (
          <Pressable
            onPress={() =>
              router.push(`/(tabs)/fields/${fieldIdForCheckin}/checkin` as never)
            }
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
          >
            <Text style={styles.addBtnText}>+ 메모·사진 더 첨부하기</Text>
          </Pressable>
        ) : null}

        {textMemos.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>텍스트 메모 ({textMemos.length})</Text>
            {textMemos.map((m) => (
              <View key={m.id} style={styles.memoBox}>
                <Text style={styles.memoText}>{m.text}</Text>
                {m.createdAt ? (
                  <Text style={styles.memoMeta}>{fmtDateTime(m.createdAt)}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {photos.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>사진 ({photos.length})</Text>
            <PhotoGrid photos={photos} />
          </View>
        ) : null}

        {voices.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>음성 메모 ({voices.length})</Text>
            <VoiceMemoList memos={voices} />
          </View>
        ) : null}

        {attachments.length === 0 ? (
          <Text style={styles.empty}>첨부된 메모·사진·음성이 없습니다.</Text>
        ) : null}
      </ScrollView>
    </MapSheetLayout>
  );
}

function SummaryBadge({ label, count }: { label: string; count: number }) {
  return (
    <View style={[styles.badge, count === 0 && styles.badgeMuted]}>
      <Text style={[styles.badgeLabel, count === 0 && styles.badgeLabelMuted]}>{label}</Text>
      <Text style={[styles.badgeCount, count === 0 && styles.badgeCountMuted]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  site: { fontSize: fontSize.xl, fontWeight: '800', color: colors.text },
  statusChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginTop: spacing.sm,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: '700' },
  meta: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm },
  reason: { fontSize: fontSize.sm, color: colors.text, marginTop: spacing.xs },
  section: { marginTop: spacing.lg },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  memoBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  memoText: { fontSize: fontSize.base, color: colors.text, lineHeight: 22 },
  memoMeta: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  empty: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '15',
  },
  badgeMuted: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  badgeLabel: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700' },
  badgeLabelMuted: { color: colors.textMuted, fontWeight: '600' },
  badgeCount: { fontSize: fontSize.xs, color: colors.primary, fontWeight: '700' },
  badgeCountMuted: { color: colors.textMuted },
  addBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + '0d',
    alignItems: 'center',
  },
  addBtnText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
