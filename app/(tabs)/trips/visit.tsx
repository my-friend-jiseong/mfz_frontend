import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { visits as visitsApi, localizeError } from '@/api';
import type { VisitDetailResponse } from '@/api';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { PhotoGrid, VoiceMemoList } from '@/components/AttachmentPreview';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// 백엔드 attachments[] shape — type 별로 union (text/photo/audio).
interface AttachmentBase {
  id: string;
  type: 'text' | 'photo' | 'audio';
  text?: string;
  fileUrl?: string;
  durationSec?: number;
  durationSeconds?: number;
  createdAt?: string;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR');
}

export default function VisitDetail() {
  const router = useRouter();
  const { tripId, visitId } = useLocalSearchParams<{
    tripId: string;
    visitId: string;
  }>();

  const [data, setData] = useState<
    (VisitDetailResponse & { attachments?: AttachmentBase[] }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tripId || !visitId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = (await visitsApi.detail(tripId, visitId)) as VisitDetailResponse & {
          attachments?: AttachmentBase[];
        };
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

  const attachments = (data.attachments ?? []) as AttachmentBase[];
  const textMemos = attachments.filter((a) => a.type === 'text');
  const photos = attachments
    .filter((a) => a.type === 'photo' && a.fileUrl)
    .map((a) => ({ id: a.id, fileUrl: a.fileUrl as string }));
  const voices = attachments
    .filter((a) => a.type === 'audio' && a.fileUrl)
    .map((a) => ({
      id: a.id,
      fileUrl: a.fileUrl as string,
      durationSec: a.durationSec ?? a.durationSeconds,
      createdAt: a.createdAt,
    }));
  // resultStatus 는 영문 enum, status 는 한국어 표시값 — 색은 영문으로 조회.
  const statusColor =
    colors.visitStatus[data.resultStatus as keyof typeof colors.visitStatus] ?? colors.text;

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
});
