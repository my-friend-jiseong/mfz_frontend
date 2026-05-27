import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { visits as visitsApi, localizeError } from '@/api';
import { safeBack } from '@/utils/backNavigation';
import type { VisitDetailResponse } from '@/api';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { VISIT_STATUS_LABEL, normalizeVisitStatus } from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';

// ERD v2: visits 는 체크인 기록만 — 메모·사진·음성 첨부 제거.
// 첨부는 현장(field) 상세에서 관리하므로 여기서는 현장으로 이동 링크 제공.

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

  const visitInStore = useVisitStore((s) => s.getById)(visitId ?? '');
  const getField = useFieldStore((s) => s.getById);

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
      <MapSheetLayout title="방문 상세" onBack={() => safeBack(router)}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </MapSheetLayout>
    );
  }

  if (error || !data) {
    return (
      <MapSheetLayout title="방문 상세" onBack={() => safeBack(router)}>
        <EmptyState title="방문을 찾을 수 없습니다" description={error ?? undefined} />
      </MapSheetLayout>
    );
  }

  const status = normalizeVisitStatus(data.status);
  const statusColor = colors.visitStatus[status] ?? colors.text;
  const fieldId = data.fieldId ?? visitInStore?.fieldId ?? null;
  const siteName = data.siteName ?? (fieldId ? getField(fieldId)?.address : null);

  return (
    <MapSheetLayout title="방문 상세" onBack={() => safeBack(router)} initialIndex={2}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.site}>{siteName ?? '현장 방문'}</Text>
        <View style={[styles.statusChip, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {VISIT_STATUS_LABEL[status]}
          </Text>
        </View>
        <Text style={styles.meta}>방문 시각: {fmtDateTime(data.visitedAt)}</Text>

        {fieldId ? (
          <Pressable
            onPress={() => router.push(`/(tabs)/fields/${fieldId}` as never)}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
          >
            <Text style={styles.addBtnText}>현장 상세로 이동 (메모·사진 관리)</Text>
          </Pressable>
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
  addBtn: {
    marginTop: spacing.lg,
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
