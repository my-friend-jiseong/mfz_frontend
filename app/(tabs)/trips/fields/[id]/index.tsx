import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPreviewCard } from '@/components/MapPreviewCard';
import { FieldDetailFooter, FieldDetailHeader } from '@/components/fields/FieldDetailChrome';
import { FieldVisitRow } from '@/components/fields/FieldVisitRow';
import { ProjectSheet } from '@/components/fields/ProjectSheet';
import { EditableTitle } from '@/components/ui/EditableTitle';
import { Tag } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { showPopoverMenu } from '@/components/ui/PopoverMenu';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { Button2 } from '@/components/ui/Button2';
import { Icon } from '@/components/icons';
import { STATUS_PIN_COLOR } from '@/components/shell/pinColors';
import { openFullMap } from '@/components/shell/fullMap';
import { useFieldStore } from '@/stores/fieldStore';
import { useVisitStore } from '@/stores/visitStore';
import { useTripStore } from '@/stores/tripStore';
import { useProjectStore } from '@/stores/projectStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { useTripPrepStore } from '@/stores/tripPrepStore';
import { fieldActionStatus } from '@/utils/fieldStatus';
import { fieldTitle } from '@/utils/fieldFacets';
import { memoForVisit } from '@/utils/visitRecord';
import { tripTitle } from '@/utils/tripFormat';
import { districtOf, stripRegion } from '@/utils/addressFormat';
import { formatDistanceM } from '@/utils/nearestField';
import { haversineKm } from '@/utils/routeOptimize';
import { peekUserLocation, type LatLng } from '@/utils/geolocation';
import { useDestinationCart } from '@/utils/destinationCart';
import { safeBack } from '@/utils/backNavigation';
import { c2, space } from '@/theme/v2';

// 5-4 더보기 메뉴 폭(Figma 707:3527).
const MORE_MENU_W = 238;

/**
 * 5 현장 상세(Figma 691:3426). 현장은 이름·주소·좌표·프로젝트·분류만 갖고, 조치 상태·사진·메모는 방문에 있다(v100).
 * 방문 목록은 가장 최근 방문이 펼쳐진 채 열리고 한 번에 하나만 펼친다(5-1). 프로젝트 → 5-3, ⋯ → 5-4([정보 수정] 5-5, [삭제] 5-11).
 */
export default function FieldDetail() {
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const fieldId = id ?? '';

  const liveField = useFieldStore((s) => s.fields.find((f) => f.id === fieldId));
  // 삭제하는 동안은 마지막 값으로 그린다 — 스토어에서 빠진 같은 틱에 '찾을 수 없어요'로 바뀌며 떠나는 화면이 뒤집히지 않게.
  const lastFieldRef = useRef(liveField);
  const deletingRef = useRef(false);
  if (liveField) lastFieldRef.current = liveField;
  const field = liveField ?? (deletingRef.current ? lastFieldRef.current : undefined);
  const directAttachments = useFieldStore((s) => s.directAttachments[fieldId]);
  const allVisits = useVisitStore((s) => s.visits);
  const photosByVisit = useVisitStore((s) => s.photosByVisit);
  const trips = useTripStore((s) => s.trips);
  const cart = useDestinationCart();

  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!fieldId) return;
    void useFieldStore
      .getState()
      .loadDetail(fieldId)
      .finally(() => setLoaded(true));
    if (useTripStore.getState().trips.length === 0) void useTripStore.getState().hydrate();
    // 5-3 시트를 열기 전에 받아 둔다 — 시트가 열리는 중에 목록이 자라면 gorhom 이 높이를 못 맞춘다(AppSheet 주석).
    void useProjectStore.getState().refresh();
  }, [fieldId]);

  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  useEffect(() => {
    void peekUserLocation().then(setMyLoc);
  }, []);

  const visits = useMemo(
    () => allVisits.filter((v) => v.fieldId === fieldId).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt)),
    [allVisits, fieldId],
  );

  // 가장 최근 방문이 펼쳐진 채 열린다 — 방문 목록이 처음 채워질 때 한 번.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const autoExpanded = useRef(false);
  useEffect(() => {
    if (autoExpanded.current || visits.length === 0) return;
    autoExpanded.current = true;
    setExpandedId(visits[0].id);
  }, [visits]);

  // 방문 사진 — 방문마다 한 번('사진 N' 과 펼친 칸에 쓴다). 실패하면 다음 렌더에서 다시.
  const fetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const v of visits) {
      if (fetchedRef.current.has(v.id)) continue;
      fetchedRef.current.add(v.id);
      void useVisitStore
        .getState()
        .loadPhotos(v.tripId, v.id)
        .then((ok) => {
          if (!ok) fetchedRef.current.delete(v.id);
        });
    }
  }, [visits]);

  const tripById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);
  const [projectOpen, setProjectOpen] = useState(false);
  const moreRef = useRef<View>(null);

  if (!field) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <FieldDetailHeader query={q ?? ''} />
        <View style={styles.missing}>
          {loaded ? (
            <>
              <Text v2="bodyL.bold">현장을 찾을 수 없어요</Text>
              <Text v2="bodyS.regular" tone="tertiary">
                삭제됐거나 다른 계정의 현장이에요.
              </Text>
              <Button2 variant="outline" size="M" onPress={() => safeBack(router)} style={styles.missingBtn}>
                돌아가기
              </Button2>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  const title = fieldTitle(field);
  const status = fieldActionStatus(field);
  const region = districtOf(field.address);
  const distance = myLoc ? formatDistanceM(haversineKm(myLoc, { lat: field.latitude, lng: field.longitude }) * 1000) : null;
  const subtitle = [region, distance ? `현 위치에서 ${distance}` : null, `방문 ${visits.length}건`].filter(Boolean).join(' · ');
  const added = cart.has(field.id);

  const saveName = async (next: string) => {
    // 비워 두면 주소가 이름이 된다(인수인계 '현장명: 기본값은 주소, 비우고 저장해도 다시 묻지 않음').
    const r = await useFieldStore.getState().update(field.id, { name: next });
    if (!r.ok) {
      await notice('현장명을 바꾸지 못했어요', r.error);
      throw new Error(r.error);
    }
  };

  const openMap = () =>
    openFullMap({
      title: [title, region].filter(Boolean).join(' · '),
      pins: [{ id: field.id, lat: field.latitude, lng: field.longitude, kind: status, selected: true, label: title }],
      nearbyFields: true,
    });

  // 5-11 — 방문 기록이 있어도 막지 않는다(v127). 서버는 force 로 지운다.
  const handleDelete = async () => {
    const n = visits.length;
    const ok = await confirm({
      title: '현장을 삭제할까요?',
      message: n > 0 ? `방문 기록 ${n}건도 함께 지워지고 되돌릴 수 없어요.` : '되돌릴 수 없어요.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok || deletingRef.current) return;
    deletingRef.current = true;
    const r = await useFieldStore.getState().remove(field.id, true);
    if (!r.ok) {
      deletingRef.current = false;
      await notice('현장을 삭제하지 못했어요', 'error' in r ? r.error : r.message);
      return;
    }
    // 서버는 진행 중 외근의 목적지를 그대로 둔다(2026-10-17 실측, 백로그 2차 F) — 남은 목적지는 건너뜀으로 돌린다.
    const activeTripId = useTripStore.getState().activeTripId;
    if (activeTripId) {
      const dest = useDestinationStore.getState().findByTripField(activeTripId, field.id);
      if (dest && dest.status === 'pending') {
        const saved = await useDestinationStore.getState().markSkipped(dest.id);
        if (!saved) {
          await notice('외근 목적지를 정리하지 못했어요', '외근 진행에서 이 목적지를 건너뛰어 주세요.');
        }
      }
    }
    useTripPrepStore.getState().remove(field.id);
    toast('현장을 삭제했어요');
    // 삭제 후 4 현장 검색으로(인수인계 현장 삭제). 스토어 변경과 화면 이동을 한 틱에 섞지 않는다.
    setTimeout(() => router.dismissTo({ pathname: '/(tabs)/trips/fields', params: { q: q ?? '' } } as never), 0);
  };

  const openMore = () =>
    showPopoverMenu(
      moreRef.current,
      [
        { label: '정보 수정', icon: 'edit', onPress: () => router.push({ pathname: '/field-edit', params: { id: field.id } } as never) },
        { label: '삭제', icon: 'trash', tone: 'danger', onPress: () => void handleDelete() },
      ],
      { width: MORE_MENU_W },
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <FieldDetailHeader query={q ?? ''} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.metaRow}>
          <Touchable
            onPress={() => setProjectOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`프로젝트: ${field.projectName ?? '없음'}, 바꾸기`}
            style={styles.project}
          >
            <Icon name="folder" size={15} color={c2.text.secondary} />
            <Text v2="caption.bold" numberOfLines={1} style={styles.projectName}>
              {field.projectName ?? '프로젝트 없음'}
            </Text>
            <Icon name="chevron-down" size={14} color={c2.text.secondary} />
          </Touchable>
          <View style={styles.tags}>
            {(field.categories ?? []).map((c) => (
              <Tag key={c} label={c} />
            ))}
          </View>
          <Touchable ref={moreRef} onPress={openMore} accessibilityRole="button" accessibilityLabel="현장 더보기 (정보 수정, 삭제)" style={styles.more}>
            <Icon name="more" size={22} color={c2.text.secondary} />
          </Touchable>
        </View>

        <EditableTitle
          value={field.name?.trim() === field.address ? '' : (field.name ?? '')}
          onSubmit={saveName}
          label="현장명"
          appearance="pencil"
          allowEmpty
          placeholder={stripRegion(field.address) || field.address}
          placeholderTone="primary"
        />
        <Text v2="bodyS.regular" tone="tertiary" style={styles.subtitle}>
          {subtitle}
        </Text>

        <MapPreviewCard
          markers={[
            {
              id: field.id,
              lat: field.latitude,
              lng: field.longitude,
              label: title,
              color: STATUS_PIN_COLOR[status],
              pin: status,
              selected: true,
            },
          ]}
          onExpand={openMap}
          accessibilityLabel="현장 위치 지도 크게 보기"
          style={styles.map}
        />

        <Text v2="bodyM.bold" style={styles.sectionTitle}>
          {'방문 '}
          <Text v2="bodyM.semibold" tone="tertiary">
            {visits.length}
          </Text>
        </Text>
        {visits.length === 0 ? (
          <Text v2="bodyS.regular" tone="tertiary" style={styles.noVisit}>
            아직 방문 기록이 없어요.
          </Text>
        ) : null}
        {visits.map((v, i) => {
          const trip = tripById.get(v.tripId);
          return (
            <FieldVisitRow
              key={v.id}
              visitedAt={v.visitedAt}
              tripTitle={trip ? tripTitle(trip) : '외근'}
              // 방문 단위 조치 상태가 서버에 없다 — 가장 최근 방문만 현장의 최근 조치 상태로 보인다(백로그 2차 D).
              status={i === 0 ? status : null}
              photos={photosByVisit[v.id] ?? []}
              memo={memoForVisit(directAttachments, v.visitedAt)?.text}
              expanded={expandedId === v.id}
              onToggle={() => setExpandedId((cur) => (cur === v.id ? null : v.id))}
              // TODO(PR7): 3-7 방문 기록 수정(체크인 수정 모드)으로 바꾼다.
              onEdit={() => router.push(`/(tabs)/trips/${v.tripId}/visits/${v.id}` as never)}
              onOpenTrip={() => router.push(`/(tabs)/trips/${v.tripId}` as never)}
              divider={i > 0}
            />
          );
        })}
      </ScrollView>
      <FieldDetailFooter
        name={title}
        lat={field.latitude}
        lng={field.longitude}
        added={added}
        onAdd={() => cart.toggle(field.id)}
      />
      <ProjectSheet open={projectOpen} onClose={() => setProjectOpen(false)} field={field} placeName={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.canvas },
  content: { paddingHorizontal: space[20], paddingTop: space[12], paddingBottom: space[24] },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space[6], marginBottom: space[2] },
  project: {
    height: 30,
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingLeft: space[10],
    paddingRight: space[8],
    // 높이 30 의 반(알약). Figma 691:3448.
    borderRadius: 15,
    borderWidth: 1,
    borderColor: c2.border.default,
  },
  projectName: { flexShrink: 1, marginLeft: space[2] },
  tags: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: space[6] },
  more: { width: 44, height: 44, marginRight: -10, alignItems: 'center', justifyContent: 'center' },
  subtitle: { marginTop: space[2] },
  map: { marginTop: space[20] },
  sectionTitle: { marginTop: space[20], marginBottom: space[2] },
  noVisit: { paddingVertical: space[16] },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[8], paddingHorizontal: space[24] },
  missingBtn: { marginTop: space[12] },
});
