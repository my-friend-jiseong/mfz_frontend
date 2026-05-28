import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { visits as visitsApi, localizeError } from '@/api';
import { safeBack } from '@/utils/backNavigation';
import type { VisitDetailResponse } from '@/api';
import { useVisitStore } from '@/stores/visitStore';
import { useFieldStore } from '@/stores/fieldStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/LoadingState';
import { VISIT_STATUS_BADGE } from '@/theme/statusBadge';
import { fmtDateTime } from '@/utils/datetime';
import {
  VISIT_STATUS_LABEL,
  normalizeVisitStatus,
} from '@/types/entities';
import { spacing } from '@/theme/spacing';

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
        <LoadingState />
      </MapSheetLayout>
    );
  }

  if (error || !data) {
    return (
      <MapSheetLayout title="방문 상세" onBack={() => safeBack(router)}>
        <EmptyState
          icon="alert-circle-outline"
          title="방문을 찾을 수 없습니다"
          description={error ?? undefined}
        />
      </MapSheetLayout>
    );
  }

  const status = normalizeVisitStatus(data.status);
  const badge = VISIT_STATUS_BADGE[status];
  const fieldId = data.fieldId ?? visitInStore?.fieldId ?? null;
  const siteName = data.siteName ?? (fieldId ? getField(fieldId)?.address : null);

  return (
    <MapSheetLayout title="방문 상세" onBack={() => safeBack(router)} initialIndex={2}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="h2" weight="heavy">
          {siteName ?? '현장 방문'}
        </Text>
        <View style={styles.badgeRow}>
          <Badge
            label={VISIT_STATUS_LABEL[status]}
            tone={badge.tone}
            shape={badge.shape}
            size="md"
          />
        </View>
        <Text variant="bodySm" color="textMuted" style={styles.meta}>
          방문 시각: {fmtDateTime(data.visitedAt)}
        </Text>

        {fieldId ? (
          <Button
            onPress={() => router.push(`/(tabs)/fields/${fieldId}` as never)}
            variant="secondary"
            fullWidth
            leftIcon="arrow-forward-circle"
            style={styles.toField}
          >
            현장 상세로 이동 (메모·사진 관리)
          </Button>
        ) : null}
      </ScrollView>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  badgeRow: { marginTop: spacing.sm, flexDirection: 'row' },
  meta: { marginTop: spacing.sm },
  toField: { marginTop: spacing.lg },
});
