import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KakaoMapWebView, type KakaoMapMarker } from '@/components/KakaoMapWebView';
import { useKakaoPlaceSearch, type ReverseAddress } from '@/components/fields/useKakaoPlaceSearch';
import { PhotoLocationPicker, type PickedLocation } from '@/components/photoBatch/PhotoLocationPicker';
import { Button2 } from '@/components/ui/Button2';
import { MapButton } from '@/components/ui/MapButton';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { goToTabRoot } from '@/components/shell/tabNav';
import { useFieldStore } from '@/stores/fieldStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { useDestinationStore } from '@/stores/destinationStore';
import { isKnownOffline } from '@/stores/checkinQueueStore';
import { assetToUploadFile, pickPhotos, type UploadFile } from '@/utils/media';
import { readPhotoMeta } from '@/utils/photoMeta';
import { assignPhotoLocation, groupPhotos, uniqueTimes, type PhotoGroup } from '@/utils/photoGroups';
import { createFieldFromPlace } from '@/utils/placeToField';
import { findCommittedCheckIn, saveVisitRecord, skipAlreadySaved, type CheckinPhoto } from '@/utils/visitRecord';
import { fieldTitle } from '@/utils/fieldFacets';
import { pickedPlaceName } from '@/utils/addressFormat';
import { haversineKm } from '@/utils/routeOptimize';
import { peekUserLocation } from '@/utils/geolocation';
import { safeBack } from '@/utils/backNavigation';
import { c2, elevation2, radius2, space } from '@/theme/v2';

// 한 번에 고를 수 있는 사진 수. 서버에 일괄 API 가 없어 묶음마다 차례로 보낸다(백로그 2차 J).
const MAX_PHOTOS = 30;
const BUSAN = { lat: 35.1, lng: 128.97 };

interface BatchPhoto {
  key: string;
  uri: string;
  file: UploadFile;
  takenAt: string;
  lat: number | null;
  lng: number | null;
}

type GroupState = 'saving' | 'done' | 'failed';

// 묶음마다 서버에 어디까지 반영했는지 — 다시 [저장]하면 남은 단계만 보낸다(같은 현장·방문을 또 만들지 않게).
interface GroupRecord {
  fieldId: string | null;
  /** 이 화면이 만든 새 현장(그만두면 체크인 없는 것은 지운다). */
  created: boolean;
  visitId: string | null;
  visitedAt: string | null;
  photos: CheckinPhoto[];
  /** 현장 만들기·체크인을 보냈는데 실패한 때 — 응답만 못 받고 서버엔 생겼을 수 있어 다시 보내기 전에 서버를 본다. */
  createTriedAt: number | null;
  checkinTriedAt: number | null;
}

// 서버·기기 시계 차이 여유(visitRecord 와 같은 값).
const CLOCK_SKEW_MS = 60 * 1000;
// 다시 보내기 전 '이미 만들어진 새 현장' 판정 거리.
const SAME_SPOT_M = 10;

/**
 * 8-7 사진으로 여러 곳 등록(Figma 600:2864) · 8-14 위치 지정 후(727:1644) · 8-8 사진 위치 지정(600:2928, PhotoLocationPicker).
 * 8-6 기록 메뉴에서 연다. 열면 바로 갤러리 → 사진을 위치별로 묶어 보여 준다.
 * 저장하면 묶음마다 (새 현장이면 현장 만들기 →) 체크인 → 사진 올리기. 등록한 현장마다 방문 1건(인수인계 정책 v133).
 */
export function PhotoBatchScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const activeTripId = useTripStore((s) => s.activeTripId);
  const fields = useFieldStore((s) => s.fields);
  const { reverse, element: placeBridge } = useKakaoPlaceSearch();

  const [phase, setPhase] = useState<'picking' | 'reading' | 'ready' | 'empty'>('picking');
  const [photos, setPhotos] = useState<Record<string, BatchPhoto>>({});
  const [groups, setGroups] = useState<PhotoGroup[]>([]);
  const [unlocated, setUnlocated] = useState<string[]>([]);
  const [addresses, setAddresses] = useState<Record<string, ReverseAddress | null>>({});
  const [assigning, setAssigning] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, GroupState>>({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const recordsRef = useRef<Record<string, GroupRecord>>({});
  // 묶을 때 이미 있던 현장 — 다시 보낼 때 이 화면이 만든 현장을 가려낸다.
  const knownFieldIds = useRef<Set<string>>(new Set());
  const savingRef = useRef(false);
  const allowLeave = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // 한 번이라도 [저장]을 눌렀으면 묶음을 고정한다 — 다시 저장할 때 남은 묶음만 보내려면 묶음이 바뀌면 안 된다.
  const locked = Object.keys(states).length > 0;
  const photoCount = Object.keys(photos).length;

  const leave = useCallback(() => {
    allowLeave.current = true;
    safeBack(router);
  }, [router]);

  // === 사진 고르기 → 위치 읽기 → 묶기 ===
  const pick = useCallback(
    async (auto: boolean) => {
      setPhase('picking');
      const assets = await pickPhotos(MAX_PHOTOS);
      if (!mountedRef.current) return;
      if (!assets) {
        // 처음 열 때 고르지 않고 닫으면 화면도 닫는다.
        if (auto) leave();
        else setPhase('empty');
        return;
      }
      setPhase('reading');
      const fieldList = useFieldStore.getState();
      const [metas] = await Promise.all([
        Promise.all(assets.map((a) => readPhotoMeta(a))),
        fieldList.listStatus === 'ready' ? Promise.resolve() : fieldList.hydrate(),
      ]);
      if (!mountedRef.current) return;
      if (useFieldStore.getState().listStatus !== 'ready') {
        await notice('현장 목록을 받지 못했어요', '기존 현장과 맞추려면 목록이 필요해요. 인터넷 연결을 확인하고 다시 해 주세요.');
        leave();
        return;
      }
      const stamp = Date.now().toString(36);
      const now = new Date().toISOString();
      const list: BatchPhoto[] = assets.map((a, i) => ({
        key: `p${stamp}-${i}`,
        uri: a.uri,
        file: assetToUploadFile(a),
        takenAt: metas[i].takenAt ?? now,
        lat: metas[i].lat,
        lng: metas[i].lng,
      }));
      const byKey = Object.fromEntries(list.map((p) => [p.key, p]));
      const fieldsNow = useFieldStore.getState().fields;
      knownFieldIds.current = new Set(fieldsNow.map((f) => f.id));
      const g = groupPhotos(list, fieldsNow);
      setPhotos(byKey);
      setGroups(g.groups);
      setUnlocated(g.unlocated);
      setPhase('ready');
    },
    [leave],
  );
  // 처음 한 번만 — 개발 중 빠른 새로 고침이 효과를 다시 돌려도 갤러리를 또 열지 않게 ref 로 막는다.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void pick(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 새 묶음 이름(주소 '당리동 312-7 부근') — 좌표를 주소로 바꾼다. 8-8 에서 주소를 받아 온 묶음은 건너뛴다.
  const asked = useRef(new Set<string>());
  useEffect(() => {
    for (const g of groups) {
      if (g.fieldId || g.key in addresses || asked.current.has(g.key)) continue;
      asked.current.add(g.key);
      void reverse(g.lat, g.lng).then((a) => {
        if (mountedRef.current) setAddresses((cur) => ({ ...cur, [g.key]: a }));
      });
    }
  }, [groups, addresses, reverse]);

  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const groupTitle = (g: PhotoGroup): string => {
    if (g.fieldId) {
      const f = fieldById.get(g.fieldId);
      return f ? fieldTitle(f) : '기존 현장';
    }
    if (!(g.key in addresses)) return '주소를 확인하고 있어요';
    const a = addresses[g.key];
    return a ? pickedPlaceName(a.jibunAddress, a.roadAddress) : pickedPlaceName('', '');
  };

  // === 지도 ===
  const markers = useMemo<KakaoMapMarker[]>(
    () =>
      groups.map((g, i) => ({
        id: g.key,
        lat: g.lat,
        lng: g.lng,
        label: String(i + 1),
        color: c2.bg.brand,
        pin: 'group',
        order: i + 1,
      })),
    [groups],
  );
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    void peekUserLocation().then((p) => {
      if (p && mountedRef.current) setHere({ lat: p.lat, lng: p.lng });
    });
  }, []);
  // 지도는 시트 위쪽(Figma 300/844)만 보인다. 시트 모서리 아래까지 깐다.
  const sheetTop = Math.max(220, Math.round(winH * (300 / 844)));
  const headerTop = insets.top + space[2];
  const fitPadding = useMemo<[number, number, number, number]>(
    () => [headerTop + 44 + space[16], space[32], space[24] + radius2['2xl'], space[32]],
    [headerTop],
  );

  // === 8-8 ===
  const startFor = (key: string): { lat: number; lng: number } => {
    // 시간이 가장 가까운, 위치를 아는 사진 자리에서 시작한다 — 같은 외근에서 앞뒤로 찍었을 가능성이 크다.
    const target = photos[key];
    let best: { lat: number; lng: number } | null = null;
    let bestDt = Infinity;
    for (const g of groups) {
      for (const k of g.photoKeys) {
        const p = photos[k];
        const at = p?.lat !== null && p?.lng !== null ? { lat: p.lat as number, lng: p.lng as number } : { lat: g.lat, lng: g.lng };
        const dt = Math.abs(new Date(p?.takenAt ?? 0).getTime() - new Date(target?.takenAt ?? 0).getTime());
        if (dt < bestDt) {
          bestDt = dt;
          best = at;
        }
      }
    }
    return best ?? here ?? BUSAN;
  };
  const onPicked = (key: string, p: PickedLocation) => {
    const before = new Set(groups.map((g) => g.key));
    const next = assignPhotoLocation(groups, key, { lat: p.lat, lng: p.lng }, useFieldStore.getState().fields);
    setGroups(next);
    setUnlocated((cur) => cur.filter((k) => k !== key));
    setPhotos((cur) => ({ ...cur, [key]: { ...cur[key], lat: p.lat, lng: p.lng } }));
    const added = next.find((g) => !before.has(g.key) && !g.fieldId);
    if (added && p.address) {
      asked.current.add(added.key);
      setAddresses((cur) => ({ ...cur, [added.key]: p.address }));
    }
    setAssigning(null);
  };

  // === 닫기 확인 ===
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (e) => {
        if (allowLeave.current) return;
        if (savingRef.current) {
          e.preventDefault();
          return;
        }
        if (photoCount === 0) return;
        e.preventDefault();
        const done = Object.values(states).filter((s) => s === 'done').length;
        void confirm({
          title: '사진 등록을 그만둘까요?',
          message: done > 0 ? `저장한 ${done}곳은 그대로 남아요. 나머지 사진은 등록되지 않아요.` : '고른 사진은 등록되지 않아요.',
          cancelLabel: '계속 등록',
          confirmLabel: '그만두기',
          destructive: true,
        }).then(async (ok) => {
          if (!ok) return;
          await dropOrphanFields();
          allowLeave.current = true;
          navigation.dispatch(e.data.action);
        });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigation, photoCount, states],
  );

  // 새 현장은 만들었는데 체크인을 못 한 묶음 — 방문 없는 빈 현장이 남지 않게 지운다(8-13 체크인 그만두기와 같음).
  const dropOrphanFields = async () => {
    for (const rec of Object.values(recordsRef.current)) {
      if (!rec.created || rec.visitId || !rec.fieldId) continue;
      const r = await useFieldStore.getState().remove(rec.fieldId);
      if (!r.ok && !('needsConfirm' in r)) {
        await notice('새 현장을 지우지 못했어요', '현장 검색에서 직접 지워 주세요.');
        return;
      }
    }
  };

  // === 저장 ===
  const recordFor = (g: PhotoGroup): GroupRecord => {
    const existing = recordsRef.current[g.key];
    if (existing) return existing;
    const list = g.photoKeys.map((k) => photos[k]).filter((p): p is BatchPhoto => !!p);
    const times = uniqueTimes(list.map((p) => p.takenAt));
    const rec: GroupRecord = {
      fieldId: g.fieldId,
      created: false,
      visitId: null,
      visitedAt: null,
      photos: list.map((p, i) => ({ key: p.key, uri: p.uri, file: p.file, takenAt: times[i] })),
      createTriedAt: null,
      checkinTriedAt: null,
    };
    recordsRef.current[g.key] = rec;
    return rec;
  };

  /** 묶음 하나: (새 현장 만들기 →) 체크인 → 사진. 실패하면 이유를 돌려준다. */
  const saveGroup = async (tripId: string, g: PhotoGroup): Promise<string | null> => {
    const rec = recordFor(g);
    // 앞서 현장 만들기가 실패했다 — 응답만 끊겼으면 서버에 이미 있다. 그 자리(10m)에 새로 생긴 현장이 있으면 그것을 쓴다.
    if (!rec.fieldId && rec.createTriedAt) {
      await useFieldStore.getState().refresh();
      const made = useFieldStore
        .getState()
        .fields.find(
          (f) => !knownFieldIds.current.has(f.id) && haversineKm({ lat: f.latitude, lng: f.longitude }, g) * 1000 <= SAME_SPOT_M,
        );
      if (made) {
        rec.fieldId = made.id;
        rec.created = true;
      }
    }
    if (!rec.fieldId) {
      rec.createTriedAt = Date.now();
      const a = addresses[g.key];
      const r = await createFieldFromPlace(
        {
          roadAddress: a?.roadAddress ?? '',
          jibunAddress: a?.jibunAddress ?? '',
          sido: a?.sido || undefined,
          sigungu: a?.sigungu || undefined,
          lat: g.lat,
          lng: g.lng,
        },
        reverse,
      );
      if (!r.ok) return `새 현장: ${r.error}`;
      rec.fieldId = r.field.id;
      rec.created = true;
    }
    const fieldId = rec.fieldId;
    let sendPhotos = rec.photos;
    // 체크인은 보낼 때마다 방문이 새로 생긴다(2026-10-17 실측: 같은 외근·현장에 두 번 → 방문 2건).
    // 앞서 실패한 체크인이 서버엔 남았을 수 있어, 그 뒤 시각의 이 현장 방문이 있으면 그것을 쓴다.
    if (!rec.visitId && rec.checkinTriedAt) {
      const found = await findCommittedCheckIn({ tripId, fieldId, attemptedAt: rec.checkinTriedAt, skewMs: CLOCK_SKEW_MS });
      if (!found.ok) return '체크인: 서버에서 앞선 기록을 확인하지 못했어요';
      if (found.visit) {
        rec.visitId = found.visit.visitId;
        rec.visitedAt = found.visit.visitedAt;
      }
    }
    if (!rec.visitId) {
      rec.checkinTriedAt = Date.now();
      const r = await useVisitStore.getState().checkIn(tripId, fieldId);
      if (!r.ok) return `체크인: ${r.error}`;
      rec.visitId = r.visit.id;
      rec.visitedAt = r.visit.visitedAt;
      const ds = useDestinationStore.getState();
      const dest = ds.findByTripField(tripId, fieldId);
      if (dest && dest.status === 'pending') ds.markArrived(dest.id);
    } else {
      // 앞서 응답 없이 끊긴 사진이 서버에 이미 있으면 다시 올리지 않는다(capturedAt 대조).
      const seen = await skipAlreadySaved({ tripId, visitId: rec.visitId, fieldId, visitedAt: rec.visitedAt, photos: sendPhotos, memo: null });
      sendPhotos = seen.photos;
    }
    const res = await saveVisitRecord({
      visitId: rec.visitId,
      fieldId,
      status: null,
      initialStatus: null,
      photos: sendPhotos,
      memo: null,
      initialMemo: null,
    });
    rec.photos = res.photos;
    return res.errors.length > 0 ? res.errors.join(', ') : null;
  };

  const save = async () => {
    if (savingRef.current) return;
    const tripId = activeTripId;
    if (!tripId) {
      await notice('진행 중인 외근이 없어요', '외근을 시작한 뒤에 등록해 주세요.');
      return;
    }
    const todo = groups.filter((g) => states[g.key] !== 'done');
    if (todo.length === 0) return;
    if (await isKnownOffline()) {
      await notice('인터넷에 연결되어 있지 않아요', '연결된 뒤에 다시 저장해 주세요.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const total = todo.length;
    let done = 0;
    const errors: string[] = [];
    let next = { ...states };
    setProgress({ done, total });
    // 서버에 일괄 API 가 없어 묶음마다 차례로 보낸다(백로그 2차 J). 한 묶음 실패로 나머지를 멈추지 않는다.
    for (const g of todo) {
      next = { ...next, [g.key]: 'saving' };
      if (mountedRef.current) setStates(next);
      const err = await saveGroup(tripId, g);
      next = { ...next, [g.key]: err ? 'failed' : 'done' };
      if (err) errors.push(`${groupTitle(g)}: ${err}`);
      done += 1;
      if (mountedRef.current) {
        setStates(next);
        setProgress({ done, total });
      }
    }
    savingRef.current = false;
    if (!mountedRef.current) return;
    const savedAll = groups.every((g) => next[g.key] === 'done');
    if (savedAll) {
      // 떠나는 화면은 바꾸지 않는다(같은 틱 setState + 이동 금지).
      allowLeave.current = true;
      toast(`${groups.length}곳을 저장했어요`);
      safeBack(router);
      requestAnimationFrame(() => goToTabRoot('trips'));
      return;
    }
    setSaving(false);
    setProgress(null);
    const failed = groups.filter((g) => next[g.key] === 'failed').length;
    await notice(
      `${failed}곳을 저장하지 못했어요`,
      `${errors.slice(0, 3).join('\n')}\n\n저장한 곳은 그대로 두고, [저장]을 다시 누르면 남은 곳만 보내요.`,
    );
  };

  // === 화면 ===
  const located = groups.reduce((n, g) => n + g.photoKeys.length, 0);
  const remaining = groups.filter((g) => states[g.key] !== 'done').length;
  const saveLabel = saving && progress
    ? `저장 중 ${progress.done}/${progress.total}`
    : locked && remaining < groups.length
      ? `남은 ${remaining}곳 저장`
      : `${groups.length}곳 저장`;
  const assigningPhoto = assigning ? photos[assigning] : null;

  return (
    <View style={styles.root}>
      <View style={[styles.map, { height: sheetTop + radius2['2xl'] }]}>
        {phase === 'ready' ? (
          <KakaoMapWebView
            markers={markers}
            center={groups.length === 0 ? (here ?? BUSAN) : undefined}
            fitToMarkers={groups.length > 0}
            fitPadding={fitPadding}
            hideScale
          />
        ) : null}
      </View>
      <View pointerEvents="box-none" style={[styles.header, { paddingTop: headerTop }]}>
        <MapButton icon="close" size={44} accessibilityLabel="닫기" onPress={() => safeBack(router)} />
        {photoCount > 0 ? (
          <View style={styles.titlePill}>
            <Text v2="title.pill" accessibilityRole="header" numeric numberOfLines={1}>
              {`사진 ${photoCount}장`}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.sheet, { top: sheetTop }]}>
        <View style={styles.handle} />
        {phase === 'ready' ? (
          <ScrollView contentContainerStyle={styles.sheetBody}>
            <Text v2="bodyS.bold" tone="secondary" numeric>
              {`위치 있음 ${located}장 · 현장 ${groups.length}곳`}
            </Text>
            <View>
              {groups.map((g, i) => (
                <GroupRow
                  key={g.key}
                  order={i + 1}
                  first={i === 0}
                  title={groupTitle(g)}
                  existing={!!g.fieldId}
                  count={g.photoKeys.length}
                  thumb={photos[g.photoKeys[0]]?.uri}
                  state={states[g.key]}
                />
              ))}
            </View>
            {unlocated.length > 0 ? (
              <>
                <Text v2="bodyS.bold" tone="secondary" numeric style={styles.sectionGap}>
                  {`위치 없음 ${unlocated.length}장`}
                </Text>
                <View>
                  {unlocated.map((k, i) => (
                    <UnlocatedRow
                      key={k}
                      first={i === 0}
                      thumb={photos[k]?.uri}
                      disabled={locked || saving}
                      onAssign={() => setAssigning(k)}
                    />
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>
        ) : phase === 'empty' ? (
          <View style={styles.center}>
            <Text v2="bodyM.regular" tone="tertiary">
              등록할 사진을 골라 주세요
            </Text>
            <Button2 variant="tonal" size="M" onPress={() => void pick(false)}>
              사진 고르기
            </Button2>
          </View>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator color={c2.bg.brand} />
            {phase === 'reading' ? (
              <Text v2="bodyS.regular" tone="tertiary">
                사진 위치를 읽고 있어요
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {phase === 'ready' ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, space[20]) }]}>
          {unlocated.length > 0 ? (
            <Text v2="caption.regular" tone="tertiary" style={styles.footerHint}>
              위치 없는 사진은 지정하지 않으면 빼고 등록돼요
            </Text>
          ) : null}
          <Button2 fullWidth onPress={() => void save()} loading={saving && !progress} disabled={remaining === 0 || saving}>
            {saveLabel}
          </Button2>
        </View>
      ) : null}

      {assigning && assigningPhoto ? (
        <PhotoLocationPicker
          key={assigning}
          photo={assigningPhoto}
          index={unlocated.indexOf(assigning) + 1}
          total={unlocated.length}
          start={startFor(assigning)}
          onClose={() => setAssigning(null)}
          onPick={(p) => onPicked(assigning, p)}
        />
      ) : null}
      {placeBridge}
    </View>
  );
}

function GroupRow({
  order,
  first,
  title,
  existing,
  count,
  thumb,
  state,
}: {
  order: number;
  first: boolean;
  title: string;
  existing: boolean;
  count: number;
  thumb?: string;
  state?: GroupState;
}) {
  const sub = `${existing ? '기존 현장에 사진 추가' : '새 현장'} · ${count}장`;
  return (
    <View style={[styles.row, !first && styles.rowLine]} accessible accessibilityLabel={`${order}번, ${title}, ${sub}`}>
      <View style={styles.badge}>
        <Text v2="caption.extrabold" tone="inverse" numeric>
          {order}
        </Text>
      </View>
      <Thumb uri={thumb} size={48} />
      <View style={styles.flex}>
        <Text v2="bodyL.bold" numberOfLines={1}>
          {title}
        </Text>
        <Text v2="caption.regular" tone={state === 'failed' ? 'warning' : state === 'done' ? 'success' : 'tertiary'} numeric numberOfLines={1}>
          {state === 'saving' ? '저장하고 있어요' : state === 'done' ? '저장했어요' : state === 'failed' ? '저장하지 못했어요' : sub}
        </Text>
      </View>
    </View>
  );
}

function UnlocatedRow({ first, thumb, disabled, onAssign }: { first: boolean; thumb?: string; disabled: boolean; onAssign: () => void }) {
  return (
    <View style={[styles.row, !first && styles.rowLine]}>
      <Thumb uri={thumb} size={48} />
      <Text v2="bodyS.semibold" tone="warning" style={styles.flex} numberOfLines={1}>
        위치 정보가 없어요
      </Text>
      <Touchable
        onPress={onAssign}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="지도에서 지정"
        accessibilityState={{ disabled }}
        style={[styles.assign, disabled && styles.dim]}
      >
        <Text v2="bodyS.bold" tone="link">
          지도에서 지정
        </Text>
      </Touchable>
    </View>
  );
}

function Thumb({ uri, size }: { uri?: string; size: number }) {
  return uri ? (
    <Image source={{ uri }} style={[styles.thumb, { width: size, height: size }]} accessibilityIgnoresInvertColors />
  ) : (
    <View style={[styles.thumb, { width: size, height: size }]} />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.muted },
  flex: { flex: 1 },
  map: { position: 'absolute', left: 0, right: 0, top: 0 },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[10],
    paddingLeft: space[12],
    paddingRight: space[16],
  },
  titlePill: {
    flexShrink: 1,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: space[16],
    borderRadius: radius2.full,
    backgroundColor: c2.bg.canvas,
    ...elevation2.control,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    borderTopLeftRadius: radius2['2xl'],
    borderTopRightRadius: radius2['2xl'],
    backgroundColor: c2.bg.canvas,
    overflow: 'hidden',
    ...elevation2.sheet,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    marginTop: space[8],
    borderRadius: 2,
    backgroundColor: c2.bg.strong,
  },
  // 손잡이 아래 8 → 제목(Figma 20), 목록 맨 아래는 바닥 버튼 영역(127)만큼 띄운다.
  sheetBody: { paddingTop: space[8], paddingHorizontal: space[20], paddingBottom: 140 },
  sectionGap: { marginTop: space[10] },
  row: { height: 64, flexDirection: 'row', alignItems: 'center', gap: space[12] },
  rowLine: { height: 65, borderTopWidth: 1, borderTopColor: c2.border.subtle },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c2.bg.brand,
  },
  thumb: { borderRadius: radius2.sm, backgroundColor: c2.bg.placeholder },
  assign: {
    height: 40,
    paddingHorizontal: space[14],
    borderRadius: 20,
    justifyContent: 'center',
    backgroundColor: c2.bg.brandSubtle,
  },
  dim: { opacity: 0.4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[12], paddingBottom: space[32] },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 12,
    paddingTop: space[12],
    paddingHorizontal: space[16],
    borderTopWidth: 1,
    borderTopColor: c2.border.default,
    backgroundColor: c2.bg.canvas,
  },
  footerHint: { textAlign: 'center', marginBottom: space[8] },
});
