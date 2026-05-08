import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { Redirect, useRouter } from 'expo-router';
import { useTripStore } from '@/stores/tripStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { MapSheetLayout } from '@/components/MapSheetLayout';
import { openKakaoRouteTo } from '@/utils/kakaoMap';
import { trips as tripsApi, localizeError } from '@/api';
import { VISIT_STATUS_LABEL } from '@/types/entities';
import { nearestNeighborOrder } from '@/utils/routeOptimize';
import {
  registerGeofencesForTrip,
  startArrivalWatcher,
  type ArrivalTarget,
  type ArrivalEvent,
} from '@/utils/geofence';
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
  const reorderDestinations = useDestinationStore((s) => s.reorder);

  const getField = useFieldStore((s) => s.getById);
  const allVisits = useVisitStore((s) => s.visits);

  const allTrips = useTripStore((s) => s.trips);
  const activeTrip = useMemo(
    () => (activeTripId ? allTrips.find((t) => t.id === activeTripId) : null),
    [allTrips, activeTripId],
  );

  const [optimizing, setOptimizing] = useState(false);
  const [elapsedTick, setElapsedTick] = useState(0);

  // 외근 진행 시간을 1분 주기로 갱신. 화면이 active 일 때만 동작.
  useEffect(() => {
    if (!activeTrip) return;
    const id = setInterval(() => setElapsedTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [activeTrip]);

  const destinations = useMemo<Destination[]>(() => {
    if (activeTripId === null) return [];
    return allDestinations
      .filter((d) => d.tripId === activeTripId)
      .sort((a, b) => a.order - b.order);
  }, [allDestinations, activeTripId]);

  // 진행률 통계 — arrived + skipped 가 처리됨, pending 만 남음.
  const progress = useMemo(() => {
    const total = destinations.length;
    const arrived = destinations.filter((d) => d.status === 'arrived').length;
    const skipped = destinations.filter((d) => d.status === 'skipped').length;
    const resolved = arrived + skipped;
    const ratio = total === 0 ? 0 : Math.round((resolved / total) * 100);
    return { total, arrived, skipped, resolved, ratio };
  }, [destinations]);

  // destination 의 fieldId 에 해당하는 활성 외근의 visit 찾기 (있으면 visit 결과 라벨 사용).
  const visitForDestination = (fieldId: string) => {
    if (!activeTripId) return null;
    return (
      allVisits.find((v) => v.tripId === activeTripId && v.fieldId === fieldId) ??
      null
    );
  };

  // 외근 시작 시각·경과 시간 — elapsedTick 의존으로 1분마다 자동 갱신.
  const elapsedLabel = useMemo(() => {
    void elapsedTick;
    if (!activeTrip) return null;
    const start = new Date(activeTrip.startedAt);
    const pad = (n: number) => String(n).padStart(2, '0');
    const startedAtStr = `${pad(start.getHours())}:${pad(start.getMinutes())}`;
    const diffMs = Math.max(0, Date.now() - start.getTime());
    const totalMin = Math.floor(diffMs / 60_000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const dur = h > 0 ? `${h}시간 ${m}분` : `${m}분`;
    return `${startedAtStr} 시작 · ${dur} 진행 중`;
  }, [activeTrip, elapsedTick]);

  // 외근 시작 시 geofence 등록 (한 번만, best-effort 백엔드 보고).
  const registeredRef = useRef<string | null>(null);
  useEffect(() => {
    if (activeTripId === null || destinations.length === 0) return;
    if (registeredRef.current === activeTripId) return;
    registeredRef.current = activeTripId;
    const fields = destinations
      .map((d) => getField(d.fieldId))
      .filter((f): f is NonNullable<typeof f> => !!f && Number.isFinite(f.latitude) && Number.isFinite(f.longitude))
      .map((f) => ({ id: f.id, name: f.address, latitude: f.latitude, longitude: f.longitude }));
    if (fields.length === 0) return;
    void registerGeofencesForTrip(activeTripId, fields);
  }, [activeTripId, destinations, getField]);

  // 도착 자동 감지 watcher — pending destination 만 타겟. 외근 변경/언마운트 시 정지.
  useEffect(() => {
    if (activeTripId === null) return;
    const targets: ArrivalTarget[] = destinations
      .filter((d) => d.status === 'pending')
      .map((d) => {
        const f = getField(d.fieldId);
        if (!f || !Number.isFinite(f.latitude) || !Number.isFinite(f.longitude)) return null;
        return { fieldId: f.id, fieldName: f.address, lat: f.latitude, lng: f.longitude };
      })
      .filter((t): t is ArrivalTarget => t !== null);
    if (targets.length === 0) return;

    let stop: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const fn = await startArrivalWatcher(activeTripId, targets, (event: ArrivalEvent) => {
        Alert.alert(
          '현장 도착 감지',
          `${event.fieldName} (약 ${Math.round(event.distanceMeters)}m). 지금 체크인할까요?`,
          [
            { text: '나중에', style: 'cancel' },
            {
              text: '지금 체크인',
              onPress: () =>
                router.push(`/(tabs)/fields/${event.fieldId}/checkin` as never),
            },
          ],
        );
      });
      if (cancelled) {
        fn();
      } else {
        stop = fn;
      }
    })();
    return () => {
      cancelled = true;
      if (stop) stop();
    };
  }, [activeTripId, destinations, getField, router]);

  const currentDest = useMemo(
    () => destinations.find((d) => d.status === 'pending'),
    [destinations],
  );

  const allDone =
    activeTripId !== null && destinations.length > 0 && !currentDest;

  // 활성 외근이 없으면 이 화면에 머물 이유가 없음 — 외근 탭 메인으로 즉시 redirect.
  // 외근 종료 직후 finalizeEnd 의 router.replace 가 어떤 이유로든 발화 못해도
  // 사용자가 /trips/active 에 잡혀 있는 일을 막는 안전망.
  if (activeTripId === null) {
    return <Redirect href="/(tabs)/trips" />;
  }

  const handleNavigate = async () => {
    if (!currentDest) return;
    const field = getField(currentDest.fieldId);
    if (!field) return;

    // 백엔드 deep-links 응답 — providers 객체로 wrap (handoff §6c).
    // 응답 받기 실패 시 카카오맵 직링크로 폴백.
    if (activeTripId) {
      try {
        const res = await tripsApi.navigationDeepLinks(activeTripId, {
          fieldId: field.id,
          destinationName: field.address,
          destinationLat: field.latitude,
          destinationLng: field.longitude,
        });
        const PROVIDERS = [
          { key: 'kakao', label: '카카오맵' },
          { key: 'naver', label: '네이버 지도' },
          { key: 'google', label: '구글 지도' },
        ] as const;
        const entries: Array<{ label: string; url: string }> = [];
        for (const p of PROVIDERS) {
          const url = res.providers?.[p.key];
          if (typeof url === 'string' && url.startsWith('http')) {
            entries.push({ label: p.label, url });
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
              text: e.label,
              onPress: () => void Linking.openURL(e.url),
            })),
          ]);
          return;
        }
      } catch {
        // fallthrough — 카카오맵 직링크
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

  // 남은 (pending) 목적지가 2개 이상일 때만 재최적화 가능
  const pendingDests = useMemo(
    () => destinations.filter((d) => d.status === 'pending'),
    [destinations],
  );
  const lastArrivedDest = useMemo(() => {
    const arrived = destinations.filter((d) => d.status === 'arrived');
    return arrived.length > 0 ? arrived[arrived.length - 1] : null;
  }, [destinations]);

  const applyOptimizedOrder = (
    pendingOrderedIds: string[],
    summary: { algorithm: string; totalDistanceKm: number; totalEtaMinutes: number },
  ) => {
    if (!activeTripId) return;
    // 이미 처리된(arrived/skipped) 목적지는 현재 순서를 보존, 그 뒤에 재최적화된 pending 을 이어붙임
    const resolvedIds = destinations
      .filter((d) => d.status !== 'pending')
      .map((d) => d.id);
    reorderDestinations(activeTripId, [...resolvedIds, ...pendingOrderedIds]);
    Alert.alert(
      '경로 재최적화 완료',
      `알고리즘: ${summary.algorithm}\n총 거리: ${summary.totalDistanceKm.toFixed(1)} km\n예상 ETA: ${summary.totalEtaMinutes}분`,
    );
  };

  const handleReoptimize = async () => {
    if (!activeTripId || pendingDests.length < 2) return;

    const pendingFields = pendingDests
      .map((d) => {
        const f = getField(d.fieldId);
        if (!f) return null;
        return {
          destId: d.id,
          fieldId: f.id,
          name: f.address,
          lat: f.latitude,
          lng: f.longitude,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (pendingFields.length < 2) {
      Alert.alert('재최적화 불가', '좌표가 있는 남은 목적지가 2개 이상 필요합니다.');
      return;
    }

    // 출발점: 마지막으로 도착한 목적지 좌표, 없으면 첫 pending 의 좌표 (PR-α 와 동일 전략)
    const startSource = lastArrivedDest
      ? getField(lastArrivedDest.fieldId)
      : null;
    const start = startSource
      ? { lat: startSource.latitude, lng: startSource.longitude }
      : { lat: pendingFields[0].lat, lng: pendingFields[0].lng };

    setOptimizing(true);
    try {
      const res = await tripsApi.optimizeNavigation(activeTripId, {
        startLat: start.lat,
        startLng: start.lng,
        fields: pendingFields.map((f) => ({
          fieldId: f.fieldId,
          name: f.name,
          lat: f.lat,
          lng: f.lng,
        })),
      });
      // 백엔드 응답의 fieldId 순서를 destId 순서로 변환
      const fieldToDest = new Map(pendingFields.map((f) => [f.fieldId, f.destId]));
      const orderedDestIds = res.optimizedOrder
        .map((o) => fieldToDest.get(o.fieldId))
        .filter((id): id is string => typeof id === 'string');
      if (orderedDestIds.length !== pendingFields.length) {
        throw new Error('optimized_order_mismatch');
      }
      applyOptimizedOrder(orderedDestIds, res.summary);
    } catch (e) {
      // 백엔드 미응답·오류 시 클라이언트 fallback (PR-α 와 동일 알고리즘)
      const ordered = nearestNeighborOrder(
        start,
        pendingFields.map((f) => ({ id: f.destId, lat: f.lat, lng: f.lng })),
      );
      const totalDistanceKm = ordered.reduce(
        (sum, n) => sum + n.distanceFromPrevKm,
        0,
      );
      const totalEtaMinutes = ordered.reduce(
        (sum, n) => sum + n.etaMinutes,
        0,
      );
      applyOptimizedOrder(
        ordered.map((n) => n.id),
        {
          algorithm: `nearest_neighbor (offline · ${localizeError(e)})`,
          totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
          totalEtaMinutes,
        },
      );
    } finally {
      setOptimizing(false);
    }
  };

  const finalizeEnd = (endedTripId: string, originalTripId: string | null) => {
    if (originalTripId !== null) {
      removeByTrip(originalTripId);
    }
    // 즉시 외근 탭 메인으로 이동 — Alert prompt 응답 여부와 무관하게 /trips/active 에서
    // 확실히 빠져나오도록. (이전엔 prompt onPress 안에서만 navigation 해서 dismiss·web
    // 환경 차이 등으로 /trips/active 에 잡히는 케이스 발생.)
    router.replace('/(tabs)/trips' as never);
    // AI 보고서 prompt — 지금 작성 시 generate 로 추가 이동, 나중에 면 /trips 에 머무름.
    Alert.alert('외근 종료', '외근이 종료되었습니다. 지금 AI 보고서를 작성할까요?', [
      { text: '나중에', style: 'cancel' },
      {
        text: '지금 작성',
        onPress: () => router.replace(`/(tabs)/reports/generate?tripId=${endedTripId}` as never),
      },
    ]);
  };

  const handleEnd = async () => {
    const tripId = activeTripId;
    const r = await endTrip();
    if (r.ok) {
      finalizeEnd(r.trip.id, tripId);
      return;
    }
    if ('needsConfirm' in r) {
      // react-native-web 의 Alert.alert 다중 버튼 분기가 불안정 — web 은 window.confirm 사용.
      const confirmEnd = async () => {
        const force = await endTrip(true);
        if (force.ok) {
          finalizeEnd(force.trip.id, tripId);
        } else if (!('needsConfirm' in force)) {
          if (Platform.OS === 'web') {
            window.alert(`오류: ${force.error}`);
          } else {
            Alert.alert('오류', force.error);
          }
        }
      };
      if (Platform.OS === 'web') {
        if (window.confirm(r.message)) {
          void confirmEnd();
        }
      } else {
        Alert.alert('외근 종료 확인', r.message, [
          { text: '취소', style: 'cancel' },
          { text: '종료', style: 'destructive', onPress: () => void confirmEnd() },
        ]);
      }
      return;
    }
    if (Platform.OS === 'web') {
      window.alert(`오류: ${r.error}`);
    } else {
      Alert.alert('오류', r.error);
    }
  };

  const renderItem = ({ item }: { item: Destination }) => {
    const field = getField(item.fieldId);
    const isCurrent = item.id === currentDest?.id;
    const c = STATUS_COLOR[item.status];
    // arrived 인 경우 visit 결과 라벨 우선 노출 (정상/부재/거절 등). pending/skipped 은 destination status 그대로.
    const visit = item.status === 'arrived' ? visitForDestination(item.fieldId) : null;
    const visitColor = visit ? colors.visitStatus[visit.status] : null;
    const onPress = () => {
      if (visit) {
        router.push(
          `/(tabs)/trips/visit?tripId=${visit.tripId}&visitId=${visit.id}` as never,
        );
      } else if (field) {
        router.push(`/(tabs)/fields/${field.id}` as never);
      }
    };
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.destRow,
          isCurrent && styles.destRowCurrent,
          pressed && styles.pressed,
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
        {visit && visitColor ? (
          <View style={[styles.statusChip, { backgroundColor: visitColor + '22' }]}>
            <Text style={[styles.statusText, { color: visitColor }]}>
              {VISIT_STATUS_LABEL[visit.status]}
            </Text>
          </View>
        ) : (
          <View style={[styles.statusChip, { backgroundColor: c + '22' }]}>
            <Text style={[styles.statusText, { color: c }]}>
              {STATUS_LABEL[item.status]}
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  const handleAckNotice = async () => {
    const r = await ackOfficialNotice();
    if (!r.ok) Alert.alert('보고 완료 표시 실패', r.error);
  };

  const ListHeader = () => (
    <View style={styles.header}>
      <View style={styles.summaryCard}>
        {elapsedLabel ? (
          <Text style={styles.summaryTime}>{elapsedLabel}</Text>
        ) : null}
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>
            방문 {progress.arrived}
            {progress.skipped > 0 ? ` · 건너뜀 ${progress.skipped}` : ''}
            {' / '}
            총 {progress.total}곳
          </Text>
          <Text style={styles.progressRatio}>{progress.ratio}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress.ratio}%` },
            ]}
          />
        </View>
      </View>

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
              {pendingDests.length >= 2 ? (
                <Pressable
                  onPress={() => void handleReoptimize()}
                  disabled={optimizing}
                  style={({ pressed }) => [
                    styles.reopBtn,
                    (pressed || optimizing) && styles.pressed,
                  ]}
                >
                  <Text style={styles.reopText}>
                    {optimizing
                      ? '최적화 중...'
                      : `✨ 남은 경로 재최적화 (${pendingDests.length}개)`}
                  </Text>
                </Pressable>
              ) : null}
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
    <View style={styles.screenRoot}>
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
      </MapSheetLayout>
      {/* 종료 버튼은 BottomSheet 외부(스크린 루트) 에 둔다 — 시트 내부에 두면
          @gorhom/bottom-sheet 의 pan 제스처 핸들러가 absolute 자식의 터치를
          가로채는 케이스가 있어 onPress 가 안 도는 회로를 차단. */}
      <Pressable
        onPress={handleEnd}
        style={({ pressed }) => [
          styles.endBtn,
          { backgroundColor: colors.danger },
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.endText}>
          {allDone ? '외근 종료' : '외근 종료 (미완료 목적지 있음)'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  header: { paddingTop: spacing.md, gap: spacing.sm },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  summaryTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressLabel: { fontSize: fontSize.sm, color: colors.text, fontWeight: '600' },
  progressRatio: {
    fontSize: fontSize.sm,
    color: colors.primary,
    fontWeight: '800',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
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
  reopBtn: {
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary + '88',
    backgroundColor: colors.primary + '10',
    alignItems: 'center',
  },
  reopText: { fontSize: fontSize.sm, color: colors.primary, fontWeight: '700' },
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
