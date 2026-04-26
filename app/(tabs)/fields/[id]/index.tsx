import { useMemo } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { useTripStore } from '@/stores/tripStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import type { Visit } from '@/types/entities';

const FIELD_STATUS_LABEL = {
  pending: '대기',
  in_progress: '진행중',
  done: '완료',
};

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR');
}

export default function FieldDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const fieldId = id ?? '';

  const allFields = useFieldStore((s) => s.fields);
  const allVisits = useVisitStore((s) => s.visits);
  const activeTripId = useTripStore((s) => s.activeTripId);

  const field = useMemo(
    () => allFields.find((f) => f.id === fieldId),
    [allFields, fieldId],
  );
  const visits = useMemo(
    () =>
      allVisits
        .filter((v) => v.fieldId === fieldId)
        .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)),
    [allVisits, fieldId],
  );

  if (!field) {
    return (
      <MapSheetLayout title="현장 상세" onBack={() => router.back()}>
        <EmptyState title="현장을 찾을 수 없습니다" />
      </MapSheetLayout>
    );
  }

  const renderVisit = ({ item }: { item: Visit }) => {
    const c = colors.visitStatus[item.status];
    return (
      <View style={styles.visitRow}>
        <Text style={styles.visitDate}>{fmtDateTime(item.visitedAt)}</Text>
        <View style={[styles.statusChip, { backgroundColor: c + '22' }]}>
          <Text style={[styles.statusText, { color: c }]}>{item.status}</Text>
        </View>
      </View>
    );
  };

  const canCheckIn = activeTripId !== null;

  const ListHeader = () => (
    <View style={styles.summary}>
      <View
        style={[
          styles.statusChip,
          {
            backgroundColor: colors.fieldStatus[field.status] + '22',
            alignSelf: 'flex-start',
          },
        ]}
      >
        <Text
          style={[
            styles.statusText,
            { color: colors.fieldStatus[field.status] },
          ]}
        >
          {FIELD_STATUS_LABEL[field.status]}
        </Text>
      </View>
      <Text style={styles.addr}>{field.address}</Text>
      {field.addressDetail ? (
        <Text style={styles.detail}>{field.addressDetail}</Text>
      ) : null}
      <Text style={styles.coord}>
        좌표: {field.latitude.toFixed(4)}, {field.longitude.toFixed(4)}
      </Text>

      <View style={styles.actions}>
        <Pressable
          onPress={() =>
            router.push(`/(tabs)/fields/${field.id}/edit` as never)
          }
          style={({ pressed }) => [styles.actionBtn, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>수정 / 삭제</Text>
        </Pressable>
        <Pressable
          onPress={() =>
            canCheckIn &&
            router.push(`/(tabs)/fields/${field.id}/checkin` as never)
          }
          disabled={!canCheckIn}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.primaryBtn,
            !canCheckIn && styles.disabledBtn,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.actionText, styles.primaryText]}>
            {canCheckIn ? '체크인' : '외근 시작 후 체크인 가능'}
          </Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>방문 이력 ({visits.length})</Text>
    </View>
  );

  return (
    <MapSheetLayout
      title="현장 상세"
      onBack={() => router.back()}
      initialIndex={2}
    >
      <BottomSheetFlatList
        data={visits}
        keyExtractor={(v) => String(v.id)}
        renderItem={renderVisit}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<EmptyState title="방문 이력이 없습니다" />}
      />
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  summary: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: '700' },
  addr: { fontSize: fontSize.lg, fontWeight: '700', color: colors.text },
  detail: { fontSize: fontSize.base, color: colors.text },
  coord: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  primaryBtn: { backgroundColor: colors.primary, borderColor: colors.primary },
  disabledBtn: { backgroundColor: colors.border, borderColor: colors.border },
  actionText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  primaryText: { color: '#fff' },
  pressed: { opacity: 0.85 },
  sectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  visitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  visitDate: { fontSize: fontSize.sm, color: colors.text },
});
