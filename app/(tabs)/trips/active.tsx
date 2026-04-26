import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useFieldStore } from '@/stores/fieldStore';
import { EmptyState } from '@/components/EmptyState';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { openKakaoRouteTo } from '@/utils/kakaoMap';
import { trips as tripsApi } from '@/api';
import * as Linking from 'expo-linking';
import { colors } from '@/theme/colors';
import { spacing, radius, fontSize } from '@/theme/spacing';
import type { Destination } from '@/types/entities';

const STATUS_LABEL: Record<Destination['status'], string> = {
  pending: '예정',
  arrived: '방문 완료',
  skipped: '건너뜀',
};

const STATUS_COLOR: Record<Destination['status'], string> = {
  pending: colors.fieldStatus.pending,
  arrived: colors.fieldStatus.done,
  skipped: colors.textMuted,
};

export default function ActiveTrip() {
  const router = useRouter();

  const activeTripId = useTripStore((s) => s.activeTripId);
  const endTrip = useTripStore((s) => s.end);
  const officialNotice = useTripStore((s) => s.officialNotice);
  const ackOfficialNotice = useTripStore((s) => s.ackOfficialNotice);

  const allDestinations = useDestinationStore((s) => s.destinations);
  const markSkipped = useDestinationStore((s) => s.markSkipped);
  const isAllResolved = useDestinationStore((s) => s.isAllResolved);
  const removeByTrip = useDestinationStore((s) => s.removeByTrip);

  const getField = useFieldStore((s) => s.getById);

  const destinations = useMemo<Destination[]>(() => {
    if (activeTripId === null) return [];
    return allDestinations
      .filter((d) => d.tripId === activeTripId)
      .sort((a, b) => a.order - b.order);
  }, [allDestinations, activeTripId]);

  const currentDest = useMemo(
    () => destinations.find((d) => d.status === 'pending'),
    [destinations],
  );

  const allDone =
    activeTripId !== null && destinations.length > 0 && !currentDest;

  if (activeTripId === null) {
    return (
      <MapSheetLayout title="진행 중인 외근" onBack={() => router.back()}>
        <EmptyState
          title="진행 중인 외근이 없습니다"
          description="외근 탭에서 외근을 시작해주세요"
        />
      </MapSheetLayout>
    );
  }

  const handleNavigate = async () => {
    if (!currentDest) return;
    const field = getField(currentDest.fieldId);
    if (!field) return;

    // 백엔드 deep-links 응답을 시도 — 다중 provider URL 묶음 (응답 shape 미명세)
    if (activeTripId) {
      try {
        const res = (await tripsApi.navigationDeepLinks(activeTripId, {
          fieldId: field.id,
          lat: field.latitude,
          lng: field.longitude,
        })) as Record<string, unknown>;
        // 응답이 { kakao: url, google: url, naver: url } 형태로 추정 — 확인되는 것만 모달
        const entries: Array<{ provider: string; url: string }> = [];
        for (const [k, v] of Object.entries(res ?? {})) {
          if (typeof v === 'string' && v.startsWith('http')) {
            entries.push({ provider: k, url: v });
          } else if (
            v &&
            typeof v === 'object' &&
            typeof (v as { url?: unknown }).url === 'string'
          ) {
            entries.push({ provider: k, url: (v as { url: string }).url });
          }
        }
        if (entries.length === 1) {
          await Linking.openURL(entries[0].url);
          return;
        }
        if (entries.length > 1) {
          Alert.alert('길찾기 — 지도 앱 선택', undefined, [
            { text: '취소', style: 'cancel' },
            ...entries.map((e) => ({
              text: e.provider,
              onPress: () => void Linking.openURL(e.url),
            })),
          ]);
          return;
        }
      } catch {
        // 백엔드 미응답 시 카카오맵 직링크로 폴백
      }
    }
    void openKakaoRouteTo(field.address, field.latitude, field.longitude);
  };

  const handleCheckIn = () => {
    if (!currentDest) return;
    router.push(`/(tabs)/fields/${currentDest.fieldId}/checkin` as never);
  };

  const handleSkip = () => {
    if (!currentDest) return;
    Alert.alert('이 목적지를 건너뛸까요?', '나중에 별도 처리할 수 있습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '건너뛰기',
        style: 'destructive',
        onPress: () => markSkipped(currentDest.id),
      },
    ]);
  };

  const finalizeEnd = (endedTripId: string, originalTripId: string | null) => {
    if (originalTripId !== null) {
      removeByTrip(originalTripId);
    }
    router.replace(`/(tabs)/trips/${endedTripId}` as never);
  };

  const handleEnd = async () => {
    const tripId = activeTripId;
    const r = await endTrip();
    if (r.ok) {
      finalizeEnd(r.trip.id, tripId);
      return;
    }
    if ('needsConfirm' in r) {
      Alert.alert('외근 종료 확인', r.message, [
        { text: '취소', style: 'cancel' },
        {
          text: '종료',
          style: 'destructive',
          onPress: async () => {
            const force = await endTrip(true);
            if (force.ok) {
              finalizeEnd(force.trip.id, tripId);
            } else if (!('needsConfirm' in force)) {
              Alert.alert('오류', force.error);
            }
          },
        },
      ]);
      return;
    }
    Alert.alert('오류', r.error);
  };

  const renderItem = ({ item }: { item: Destination }) => {
    const field = getField(item.fieldId);
    const isCurrent = item.id === currentDest?.id;
    const c = STATUS_COLOR[item.status];
    return (
      <View
        style={[
          styles.destRow,
          isCurrent && styles.destRowCurrent,
        ]}
      >
        <View style={styles.orderBadge}>
          <Text style={styles.orderText}>{item.order}</Text>
        </View>
        <View style={styles.destText}>
          <Text style={styles.address}>
            {field?.address ?? '알 수 없는 현장'}
          </Text>
          {field?.addressDetail ? (
            <Text style={styles.detail}>{field.addressDetail}</Text>
          ) : null}
        </View>
        <View style={[styles.statusChip, { backgroundColor: c + '22' }]}>
          <Text style={[styles.statusText, { color: c }]}>
            {STATUS_LABEL[item.status]}
          </Text>
        </View>
      </View>
    );
  };

  const handleAckNotice = async () => {
    const r = await ackOfficialNotice();
    if (!r.ok) Alert.alert('보고 완료 표시 실패', r.error);
  };

  const ListHeader = () => (
    <View style={styles.header}>
      {officialNotice.required ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeLabel}>⚠️ 소속기관장 보고 필요</Text>
          <Text style={styles.noticeText}>
            {officialNotice.message ?? '외근 변경 사항을 소속기관장에게 보고해주세요.'}
          </Text>
          <Pressable
            onPress={() => void handleAckNotice()}
            style={({ pressed }) => [styles.noticeBtn, pressed && styles.pressed]}
          >
            <Text style={styles.noticeBtnText}>보고 완료 표시</Text>
          </Pressable>
        </View>
      ) : null}
      {currentDest ? (
        (() => {
          const field = getField(currentDest.fieldId);
          return (
            <View style={styles.currentCard}>
              <Text style={styles.currentLabel}>현재 목적지</Text>
              <Text style={styles.currentOrder}>{currentDest.order}번째</Text>
              <Text style={styles.currentAddress}>{field?.address}</Text>
              {field?.addressDetail ? (
                <Text style={styles.currentDetail}>{field.addressDetail}</Text>
              ) : null}
              <View style={styles.actions}>
                <Pressable
                  onPress={() => void handleNavigate()}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.primaryBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.actionText, styles.primaryText]}>
                    길찾기
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleCheckIn}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.successBtn,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.actionText, styles.primaryText]}>
                    체크인
                  </Text>
                </Pressable>
              </View>
              <Pressable
                onPress={handleSkip}
                style={({ pressed }) => [
                  styles.skipBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.skipText}>이 목적지 건너뛰기</Text>
              </Pressable>
            </View>
          );
        })()
      ) : (
        <View style={styles.doneCard}>
          <Text style={styles.doneTitle}>모든 목적지 처리 완료</Text>
          <Text style={styles.doneSub}>
            아래 버튼으로 외근을 종료해주세요
          </Text>
        </View>
      )}
      <Text style={styles.sectionTitle}>
        목적지 ({destinations.length})
      </Text>
    </View>
  );

  return (
    <MapSheetLayout
      title="진행 중인 외근"
      onBack={() => router.back()}
      initialIndex={2}
    >
      <BottomSheetFlatList
        data={destinations}
        keyExtractor={(d) => String(d.id)}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={styles.list}
      />
      <Pressable
        onPress={handleEnd}
        style={({ pressed }) => [
          styles.endBtn,
          { backgroundColor: allDone ? colors.danger : colors.textMuted },
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.endText}>외근 종료</Text>
      </Pressable>
    </MapSheetLayout>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  header: { paddingTop: spacing.md, gap: spacing.sm },
  currentCard: {
    backgroundColor: colors.primary + '0e',
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary + '55',
    gap: spacing.xs,
  },
  currentLabel: {
    fontSize: fontSize.xs,
    color: colors.primary,
    fontWeight: '700',
  },
  currentOrder: { fontSize: fontSize.sm, color: colors.textMuted },
  currentAddress: {
    fontSize: fontSize.lg,
    color: colors.text,
    fontWeight: '700',
  },
  currentDetail: { fontSize: fontSize.sm, color: colors.text },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryBtn: { backgroundColor: colors.primary },
  successBtn: { backgroundColor: colors.success },
  actionText: { fontSize: fontSize.sm, fontWeight: '700', color: colors.text },
  primaryText: { color: '#fff' },
  skipBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  skipText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  doneCard: {
    backgroundColor: colors.success + '12',
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.success + '55',
    alignItems: 'center',
  },
  doneTitle: {
    fontSize: fontSize.base,
    color: colors.success,
    fontWeight: '700',
  },
  doneSub: {
    fontSize: fontSize.sm,
    color: colors.text,
    marginTop: spacing.xs,
  },
  sectionTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: '700',
    marginTop: spacing.lg,
  },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  destRowCurrent: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '08',
  },
  orderBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: { color: colors.text, fontSize: fontSize.xs, fontWeight: '700' },
  destText: { flex: 1 },
  address: { fontSize: fontSize.base, color: colors.text, fontWeight: '600' },
  detail: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  statusText: { fontSize: fontSize.xs, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  endBtn: {
    position: 'absolute',
    bottom: spacing.xl,
    left: spacing.xl,
    right: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  endText: { color: '#fff', fontSize: fontSize.base, fontWeight: '700' },
  noticeCard: {
    backgroundColor: colors.warning + '15',
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.warning + '66',
    gap: spacing.xs,
  },
  noticeLabel: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.warning,
  },
  noticeText: {
    fontSize: fontSize.sm,
    color: colors.text,
    lineHeight: 20,
  },
  noticeBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warning,
    alignSelf: 'flex-start',
  },
  noticeBtnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '700' },
});
