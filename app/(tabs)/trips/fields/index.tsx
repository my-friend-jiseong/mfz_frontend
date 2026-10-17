import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KakaoMapWebView, type KakaoMapMarker } from '@/components/KakaoMapWebView';
import { useKakaoPlaceSearch } from '@/components/fields/useKakaoPlaceSearch';
import { FieldSearchRow, PlaceSearchRow, ProjectSearchRow } from '@/components/fields/SearchRows';
import { SheetHandle } from '@/components/ui/AppSheet';
import { SearchBar } from '@/components/ui/SearchBar';
import { MapButton } from '@/components/ui/MapButton';
import { DestinationFAB } from '@/components/ui/DestinationFAB';
import { MapPickCard } from '@/components/fields/MapPickCard';
import { Button2 } from '@/components/ui/Button2';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { STATUS_LABEL } from '@/components/ui/StatusMark';
import { toast } from '@/components/ui/Toast';
import { Icon } from '@/components/icons';
import { STATUS_PIN_COLOR } from '@/components/shell/pinColors';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { useProjectStore } from '@/stores/projectStore';
import { fields as fieldsApi, type AddressSearchItem } from '@/api';
import { fieldActionStatus } from '@/utils/fieldStatus';
import { fieldTitle } from '@/utils/fieldFacets';
import { useDestinationCart } from '@/utils/destinationCart';
import { createFieldFromPlace, type PlaceTarget } from '@/utils/placeToField';
import { districtOf, pickedPlaceName, shortJibun, stripRegion } from '@/utils/addressFormat';
import { MIN_KEYWORD_LEN, SEARCH_DEBOUNCE_MS, mergeSearchItems } from '@/utils/addressSearch';
import { formatDistanceM } from '@/utils/nearestField';
import { haversineKm } from '@/utils/routeOptimize';
import { fmtMonthDay } from '@/utils/datetime';
import { peekUserLocation, type LatLng } from '@/utils/geolocation';
import { safeBack } from '@/utils/backNavigation';
import { placeParams } from '@/utils/placeParams';
import { c2, elevation2, radius2, space } from '@/theme/v2';
import type { Field } from '@/types/entities';

// 시트를 내렸을 때 보이는 높이(4-3 '올리면 목록'). Figma 537:1715 는 탭 바 위 62.
const SHEET_PEEK = 62;
const SEARCH_H = 52;
const MAX_RECENT = 20;
const MAX_PLACES = 10;
const SHEET_HANDLE_H = 20;

const SheetHandleSlot = () => <SheetHandle />;

type Picked =
  | { kind: 'field'; field: Field }
  | { kind: 'point'; lat: number; lng: number; road: string; jibun: string; sido: string; sigungu: string; resolving: boolean };

interface PlaceResult {
  key: string;
  item: AddressSearchItem;
  kind: 'place' | 'address';
  distanceM: number | null;
}

/**
 * 4 현장 검색(지도 위 시트). 검색어가 없으면 프로젝트·최근 방문한 현장, 있으면 4-1 결과(등록된 현장 + 주소·장소),
 * 없으면 4-2. 시트를 끝까지 내리면 4-3 지도에서 고르기 — 현장 핀을 누르거나 빈 곳을 길게 눌러 고른다.
 */
export default function FieldSearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; n?: string }>();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const projects = useProjectStore((s) => s.projects);
  const cart = useDestinationCart();
  const { search: searchPlaces, reverse, element: placeBridge } = useKakaoPlaceSearch();

  const [query, setQuery] = useState(params.q ?? '');
  // 5 에서 머리의 검색창·지우기·삭제로 돌아오면 그 검색어로 맞춘다. 같은 검색어로 다시 와도 맞추도록
  // 보낼 때마다 바뀌는 n(시각)을 함께 받는다 — 그냥 뒤로 오면(n 그대로) 입력하던 검색어를 그대로 둔다.
  useEffect(() => {
    if (params.q !== undefined) setQuery(params.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q, params.n]);

  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  useEffect(() => {
    void peekUserLocation().then(setMyLoc);
    if (useFieldStore.getState().listStatus === 'idle') void useFieldStore.getState().hydrate();
    void useProjectStore.getState().refresh();
  }, []);

  // 새로 만든 현장은 응답에 담당자가 비어 올 수 있다(fieldStore.create) — 빈 값도 내 현장으로 본다.
  const myFields = useMemo(() => allFields.filter((f) => !f.userId || f.userId === userId), [allFields, userId]);
  const distanceTo = useCallback(
    (lat: number, lng: number) => (myLoc ? haversineKm(myLoc, { lat, lng }) * 1000 : null),
    [myLoc],
  );

  // === 검색어 없음: 프로젝트 · 최근 방문한 현장 ===
  const projectRows = useMemo(() => {
    const byProject = new Map<string, Field[]>();
    for (const f of myFields) {
      if (!f.projectId) continue;
      byProject.set(f.projectId, [...(byProject.get(f.projectId) ?? []), f]);
    }
    return projects
      .filter((p) => (byProject.get(p.id)?.length ?? 0) > 0)
      .map((p) => {
        const list = byProject.get(p.id) ?? [];
        const pending = list.filter((f) => fieldActionStatus(f) === 'pending').length;
        const done = list.filter((f) => fieldActionStatus(f) === 'done').length;
        const tail =
          done === list.length ? '모두 조치 완료' : pending > 0 ? `조치 전 ${pending}곳` : `조치 중 ${list.length - done}곳`;
        return { id: p.id, name: p.name, meta: `현장 ${list.length}곳 · ${tail}`, ids: list.map((f) => f.id) };
      });
  }, [projects, myFields]);

  const recentFields = useMemo(
    () =>
      myFields
        .filter((f) => f.recentVisitedAt)
        .sort((a, b) => (b.recentVisitedAt ?? '').localeCompare(a.recentVisitedAt ?? ''))
        .slice(0, MAX_RECENT),
    [myFields],
  );

  // === 검색어 있음: 등록된 현장 + 주소·장소 ===
  const q = query.trim();
  const fieldResults = useMemo(() => {
    if (!q) return [];
    const lower = q.toLowerCase();
    return myFields.filter((f) => fieldTitle(f).toLowerCase().includes(lower) || f.address.toLowerCase().includes(lower));
  }, [q, myFields]);

  const [places, setPlaces] = useState<{ addr: AddressSearchItem[]; poi: AddressSearchItem[] }>({ addr: [], poi: [] });
  const [placesLoading, setPlacesLoading] = useState(false);
  const reqRef = useRef(0);
  // 장소 검색은 내 위치(없으면 내 현장 근처) 기준 — 같은 이름의 먼 곳이 앞에 오지 않게.
  const nearRef = useRef<LatLng | null>(null);
  nearRef.current = myLoc ?? (myFields[0] ? { lat: myFields[0].latitude, lng: myFields[0].longitude } : null);
  useEffect(() => {
    if (q.length < MIN_KEYWORD_LEN) {
      reqRef.current++;
      setPlaces({ addr: [], poi: [] });
      setPlacesLoading(false);
      return;
    }
    const my = ++reqRef.current;
    setPlacesLoading(true);
    const h = setTimeout(() => {
      const addrP = fieldsApi.addressSearch(q).then(
        (r) => r.items,
        () => [] as AddressSearchItem[],
      );
      const poiP = searchPlaces(q, nearRef.current).catch(() => [] as AddressSearchItem[]);
      void Promise.all([addrP, poiP]).then(([addr, poi]) => {
        if (my !== reqRef.current) return;
        setPlaces({ addr, poi });
        setPlacesLoading(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [q, searchPlaces]);

  const placeResults = useMemo<PlaceResult[]>(() => {
    // 내 현장과 같은 곳(≈110m 격자)은 '등록된 현장'에 이미 있으니 뺀다.
    const taken = new Set(myFields.map((f) => `${f.latitude.toFixed(3)},${f.longitude.toFixed(3)}`));
    // 장소(카카오 키워드)와 주소(서버 도로명·지번)는 따로 둔다 — 같은 건물이어도 Figma 4-1 은
    // '낙동초등학교 [초등학교]' 와 '낙동대로 550 [도로명] · 지번 …' 을 다른 줄로 보인다. 같은 갈래 안의 겹침만 뺀다.
    const seen = new Set<string>();
    const tagged = [
      ...mergeSearchItems(places.poi, []).map((it) => ({ it, kind: 'place' as const })),
      ...mergeSearchItems(places.addr, []).map((it) => ({ it, kind: 'address' as const })),
    ];
    return tagged
      .filter(({ it }) => !taken.has(`${it.lat.toFixed(3)},${it.lng.toFixed(3)}`))
      .filter(({ it, kind }) => {
        // 이름·주소가 같은 결과(같은 건물의 여러 입구 등)는 한 줄만.
        const k = `${kind}|${kind === 'place' ? (it.buildingName ?? '') : ''}|${it.roadAddress}|${it.jibunAddress}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map(({ it, kind }, i) => ({
        key: `${kind}${i}:${it.lat},${it.lng}`,
        item: it,
        kind,
        distanceM: distanceTo(it.lat, it.lng),
      }))
      .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))
      .slice(0, MAX_PLACES);
  }, [places, myFields, distanceTo]);

  // === 시트 ===
  const sheetRef = useRef<BottomSheet>(null);
  const [containerH, setContainerH] = useState<number | null>(null);
  const [sheetIndex, setSheetIndex] = useState(1);
  const headerBottom = insets.top + space[4] + SEARCH_H;
  const maxSheet = containerH ? Math.max(SHEET_PEEK + 1, containerH - headerBottom - space[16]) : null;
  const snapPoints = useMemo(() => (maxSheet ? [SHEET_PEEK, maxSheet] : [SHEET_PEEK]), [maxSheet]);
  const picking = sheetIndex === 0;
  const openPicking = () => sheetRef.current?.snapToIndex(0);

  // === 지도에서 고르기(4-3) ===
  const [picked, setPicked] = useState<Picked | null>(null);
  useEffect(() => {
    if (!picking) setPicked(null);
  }, [picking]);

  const onLongPress = useCallback(
    (p: LatLng) => {
      if (!picking) return;
      setPicked({ kind: 'point', lat: p.lat, lng: p.lng, road: '', jibun: '', sido: '', sigungu: '', resolving: true });
      void reverse(p.lat, p.lng).then((a) => {
        setPicked((cur) =>
          cur?.kind === 'point' && cur.lat === p.lat && cur.lng === p.lng
            ? {
                ...cur,
                road: a?.roadAddress ?? '',
                jibun: a?.jibunAddress ?? '',
                sido: a?.sido ?? '',
                sigungu: a?.sigungu ?? '',
                resolving: false,
              }
            : cur,
        );
      });
    },
    [picking, reverse],
  );

  const openField = useCallback(
    (f: Field) => router.push({ pathname: '/(tabs)/trips/fields/[id]', params: { id: f.id, q: query } } as never),
    [router, query],
  );
  const openPlace = (item: AddressSearchItem) =>
    router.push({ pathname: '/(tabs)/trips/fields/place', params: placeParams(item, query) } as never);

  const onMarkerPress = useCallback(
    (id: string) => {
      const f = useFieldStore.getState().fields.find((x) => x.id === id);
      if (!f) return;
      if (picking) setPicked({ kind: 'field', field: f });
      else openField(f);
    },
    [picking, openField],
  );

  const markers = useMemo<KakaoMapMarker[]>(() => {
    const list: KakaoMapMarker[] = myFields
      .filter((f) => Number.isFinite(f.latitude) && Number.isFinite(f.longitude))
      .map((f) => {
        const kind = fieldActionStatus(f);
        return {
          id: f.id,
          lat: f.latitude,
          lng: f.longitude,
          label: fieldTitle(f),
          sublabel: districtOf(f.address),
          color: STATUS_PIN_COLOR[kind],
          pin: kind,
          selected: picked?.kind === 'field' && picked.field.id === f.id,
        };
      });
    if (picked?.kind === 'point') {
      list.push({ id: '__picked', lat: picked.lat, lng: picked.lng, label: '선택한 위치', color: STATUS_PIN_COLOR.new, pin: 'new', selected: true });
    }
    return list;
  }, [myFields, picked]);
  const center = useMemo(
    () => myLoc ?? (myFields[0] ? { lat: myFields[0].latitude, lng: myFields[0].longitude } : undefined),
    [myLoc, myFields],
  );

  // === 담기 ===
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const addPlace = async (key: string, target: PlaceTarget): Promise<Field | null> => {
    if (addingKey) return null;
    setAddingKey(key);
    const r = await createFieldFromPlace(target, reverse);
    setAddingKey(null);
    if (!r.ok) {
      toast(r.error);
      return null;
    }
    cart.add([r.field.id]);
    return r.field;
  };

  const fieldMeta = (f: Field, tail: string | null | undefined) => {
    const d = distanceTo(f.latitude, f.longitude);
    return [d != null ? formatDistanceM(d) : null, tail].filter(Boolean).join(' · ');
  };

  const renderEmptyQuery = () => (
    <>
      <Text v2="small.semibold" tone="tertiary" style={styles.pullHint}>
        내리면 지도에서 위치를 선택할 수 있어요
      </Text>
      {projectRows.length > 0 ? (
        <View style={styles.section}>
          <Text v2="bodyS.bold" tone="secondary" style={styles.sectionTitle}>
            프로젝트
          </Text>
          {projectRows.map((p, i) => (
            <ProjectSearchRow
              key={p.id}
              name={p.name}
              meta={p.meta}
              allAdded={p.ids.every((id) => cart.has(id))}
              onAddAll={() => cart.add(p.ids)}
              divider={i > 0}
            />
          ))}
        </View>
      ) : null}
      {projectRows.length > 0 && recentFields.length > 0 ? <View style={styles.band} /> : null}
      {recentFields.length > 0 ? (
        <View style={styles.section}>
          <Text v2="bodyS.bold" tone="secondary" style={[styles.sectionTitle, projectRows.length > 0 && styles.sectionTitleGap]}>
            최근 방문한 현장
          </Text>
          {recentFields.map((f, i) => (
            <FieldSearchRow
              key={f.id}
              title={fieldTitle(f)}
              status={fieldActionStatus(f)}
              meta={fieldMeta(f, f.recentVisitedAt ? fmtMonthDay(f.recentVisitedAt) : null)}
              added={cart.has(f.id)}
              onPress={() => openField(f)}
              onToggle={() => cart.toggle(f.id)}
              divider={i > 0}
            />
          ))}
        </View>
      ) : null}
    </>
  );

  const noResults = q.length > 0 && fieldResults.length === 0 && placeResults.length === 0 && !placesLoading;

  const renderResults = () =>
    noResults ? (
      // 4-2 결과 없음
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Icon name="search-minus" size={28} color={c2.text.secondary} />
        </View>
        <Text v2="title.xs" style={styles.center}>{`'${q}' 결과가 없어요`}</Text>
        <Text v2="bodyS.regular" tone="tertiary" style={styles.center}>
          {'주소는 도로명이나 지번으로,\n장소는 이름으로 검색해 보세요.'}
        </Text>
        <Button2 variant="outline" size="M" icon="map" onPress={openPicking} style={styles.emptyBtn}>
          지도에서 위치 고르기
        </Button2>
      </View>
    ) : (
      <>
        {fieldResults.length > 0 ? (
          <View style={styles.section}>
            <Text v2="bodyS.bold" tone="secondary" style={styles.sectionTitle}>
              {'등록된 현장 '}
              <Text v2="bodyS.semibold" tone="tertiary">
                {fieldResults.length}
              </Text>
            </Text>
            {fieldResults.map((f, i) => (
              <FieldSearchRow
                key={f.id}
                title={fieldTitle(f)}
                query={q}
                status={fieldActionStatus(f)}
                meta={fieldMeta(f, f.projectName)}
                added={cart.has(f.id)}
                onPress={() => openField(f)}
                onToggle={() => cart.toggle(f.id)}
                divider={i > 0}
              />
            ))}
          </View>
        ) : null}
        {fieldResults.length > 0 && placeResults.length > 0 ? <View style={styles.band} /> : null}
        {placeResults.length > 0 ? (
          <View style={styles.section}>
            <Text v2="bodyS.bold" tone="secondary" style={[styles.sectionTitle, fieldResults.length > 0 && styles.sectionTitleGap]}>
              {'주소·장소 '}
              <Text v2="bodyS.semibold" tone="tertiary">
                {placeResults.length}
              </Text>
            </Text>
            {placeResults.map((p, i) => {
              const it = p.item;
              const isPlace = p.kind === 'place';
              const title = isPlace && it.buildingName ? it.buildingName : stripRegion(it.roadAddress || it.jibunAddress);
              const dist = p.distanceM != null ? formatDistanceM(p.distanceM) : null;
              const tail = isPlace
                ? districtOf(it.jibunAddress || it.roadAddress)
                : it.roadAddress && it.jibunAddress
                  ? `지번 ${shortJibun(it.jibunAddress)}`
                  : '';
              return (
                <PlaceSearchRow
                  key={p.key}
                  title={title}
                  query={q}
                  kind={p.kind}
                  tag={isPlace ? it.placeCategory || undefined : it.roadAddress ? '도로명' : '지번'}
                  meta={[dist, tail].filter(Boolean).join(' · ')}
                  adding={addingKey === p.key}
                  onPress={() => openPlace(isPlace ? it : { ...it, buildingName: null })}
                  onAdd={() =>
                    void addPlace(p.key, {
                      name: isPlace ? it.buildingName : null,
                      roadAddress: it.roadAddress,
                      jibunAddress: it.jibunAddress,
                      sido: it.sido,
                      sigungu: it.sigungu,
                      lat: it.lat,
                      lng: it.lng,
                    })
                  }
                  divider={i > 0}
                />
              );
            })}
          </View>
        ) : null}
        {!placesLoading || fieldResults.length + placeResults.length > 0 ? (
          <View style={styles.pickBox}>
            <Text v2="bodyS.semibold" tone="secondary">
              찾는 곳이 없으면
            </Text>
            <Touchable onPress={openPicking} accessibilityRole="button">
              <Text v2="bodyS.bold" tone="link">
                지도에서 위치 고르기
              </Text>
            </Touchable>
          </View>
        ) : null}
      </>
    );

  // === 4-3 선택 카드 ===
  let card: { label: string; title: string; meta: string; added: boolean; onOpen?: () => void; onAdd: () => void } | null = null;
  if (picking && picked?.kind === 'field') {
    const f = picked.field;
    const d = distanceTo(f.latitude, f.longitude);
    card = {
      label: '선택한 현장',
      title: fieldTitle(f),
      meta: [STATUS_LABEL[fieldActionStatus(f)], d != null ? `현 위치에서 ${formatDistanceM(d)}` : null].filter(Boolean).join(' · '),
      added: cart.has(f.id),
      onOpen: () => openField(f),
      onAdd: () => cart.toggle(f.id),
    };
  } else if (picking && picked?.kind === 'point') {
    const p = picked;
    const d = distanceTo(p.lat, p.lng);
    card = {
      label: '선택한 위치',
      title: p.resolving ? '주소를 확인하고 있어요' : pickedPlaceName(p.jibun, p.road),
      meta: ['첫 방문', d != null ? `현 위치에서 ${formatDistanceM(d)}` : null].filter(Boolean).join(' · '),
      added: false,
      onAdd: () =>
        void addPlace('__picked', {
          roadAddress: p.road,
          jibunAddress: p.jibun,
          sido: p.sido,
          sigungu: p.sigungu,
          lat: p.lat,
          lng: p.lng,
        }).then((made) => {
          // 현장이 되었으니 그 핀(검은 핀 대신 상태 핀)을 고른 채로 둔다.
          if (made) setPicked({ kind: 'field', field: made });
        }),
    };
  }

  return (
    <View style={styles.root} onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}>
      {placeBridge}
      <KakaoMapWebView
        markers={markers}
        center={center}
        initialLevel={6}
        myLocation={myLoc}
        onMarkerPress={onMarkerPress}
        onLongPress={onLongPress}
      />

      <View style={[styles.header, { top: insets.top + space[4] }]} pointerEvents="box-none">
        <MapButton icon="arrow-left" size={44} accessibilityLabel="뒤로" onPress={() => safeBack(router)} />
        <SearchBar
          value={query}
          onChangeText={(v) => {
            setQuery(v);
            if (picking) sheetRef.current?.snapToIndex(1);
          }}
          onFocus={() => {
            if (picking) sheetRef.current?.snapToIndex(1);
          }}
          placeholder="현장 이름이나 주소"
          autoFocus={!params.q}
          style={styles.search}
        />
        {!picking ? <DestinationFAB size={44} count={cart.count} onPress={cart.open} /> : null}
      </View>

      {picking ? (
        <View style={[styles.hintWrap, { top: headerBottom + space[12] }]} pointerEvents="none">
          <View style={styles.hint}>
            <Text v2="caption.semibold" tone="inverse">
              현장 핀을 누르거나, 빈 곳을 길게 눌러 위치를 골라 주세요
            </Text>
          </View>
        </View>
      ) : null}

      {picking ? (
        <View style={[styles.pickArea, { bottom: SHEET_PEEK + space[8] }]} pointerEvents="box-none">
          <DestinationFAB count={cart.count} onPress={cart.open} style={styles.fabLg} />
          {card ? (
            <MapPickCard
              label={card.label}
              title={card.title}
              meta={card.meta}
              added={card.added}
              onOpen={card.onOpen}
              onToggle={card.onAdd}
              loading={addingKey === '__picked'}
              disabled={picked?.kind === 'point' && picked.resolving}
            />
          ) : null}
        </View>
      ) : null}

      {/* 높이를 재기 전엔 시트를 그리지 않는다 — snapPoints 를 마운트 뒤 바꾸면 gorhom 이 시트를 엉뚱한 곳에 둔다. */}
      {maxSheet ? (
        <BottomSheet
          ref={sheetRef}
          index={1}
          snapPoints={snapPoints}
          enableDynamicSizing={false}
          enablePanDownToClose={false}
          onChange={setSheetIndex}
          handleComponent={SheetHandleSlot}
          backgroundStyle={styles.sheetBg}
          style={styles.sheetShadow}
        >
          {/* 명시적 height — gorhom 콘텐츠 높이 미적용(Fabric+reanimated 4) 우회(MapSheetLayout 주석). */}
          <View style={{ height: maxSheet - SHEET_HANDLE_H }}>
            {picking ? (
              <Touchable onPress={() => sheetRef.current?.snapToIndex(1)} accessibilityRole="button" style={styles.peek}>
                <Text v2="caption.semibold" tone="secondary">
                  올리면 목록
                </Text>
              </Touchable>
            ) : (
              <BottomSheetScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
                {q ? renderResults() : renderEmptyQuery()}
              </BottomSheetScrollView>
            )}
          </View>
        </BottomSheet>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.muted },
  header: { position: 'absolute', left: space[8], right: space[16], flexDirection: 'row', alignItems: 'center', gap: space[8] },
  search: { flex: 1 },
  hintWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hint: {
    paddingHorizontal: space[14],
    paddingVertical: space[6],
    borderRadius: radius2.full,
    backgroundColor: c2.bg.hint,
  },
  pickArea: { position: 'absolute', left: space[12], right: space[12], alignItems: 'flex-end', gap: space[12] },
  fabLg: { marginRight: space[4] },
  sheetBg: { backgroundColor: c2.bg.canvas, borderTopLeftRadius: radius2['2xl'], borderTopRightRadius: radius2['2xl'] },
  sheetShadow: { ...elevation2.sheet, borderTopLeftRadius: radius2['2xl'], borderTopRightRadius: radius2['2xl'] },
  sheetContent: { paddingBottom: space[32] },
  pullHint: { textAlign: 'center', marginTop: -space[2] },
  section: { paddingHorizontal: space[20] },
  sectionTitle: { paddingTop: space[12], paddingBottom: space[4] },
  sectionTitleGap: { paddingTop: space[16], paddingBottom: space[12] },
  band: { height: 8, backgroundColor: c2.bg.muted, marginTop: space[8] },
  peek: { height: 40, alignItems: 'center', justifyContent: 'center' },
  pickBox: {
    marginTop: space[24],
    marginHorizontal: space[20],
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[6],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.subtle,
  },
  empty: { alignItems: 'center', paddingTop: 56, paddingHorizontal: space[24], gap: space[8] },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius2.full,
    backgroundColor: c2.bg.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[12],
  },
  emptyBtn: { marginTop: space[20] },
  center: { textAlign: 'center' },
});
