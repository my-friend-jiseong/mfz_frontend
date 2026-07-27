import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import type { AddressSearchItem } from '@/api';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import {
  KakaoMapWebView,
  fieldsToMarkers,
  type KakaoMapHandle,
} from '@/components/KakaoMapWebView';
import { MapLegend } from '@/components/MapLegend';
import { elevation } from '@/theme/elevation';
import { spacing, radius } from '@/theme/spacing';
import { requestUserLocation, type LatLng } from '@/utils/geolocation';
import { MapFilterBar } from '@/components/MapFilterBar';
import { MapSearchBar } from '@/components/MapSearchBar';
import { useMapSettingsStore } from '@/stores/mapSettingsStore';
import { useCategoryStore } from '@/stores/categoryStore';
import { mergeCategoryNames } from '@/utils/fieldFacets';
import { colors } from '@/theme/colors';

// 비로그인 시 myFields — 렌더마다 새 [] 를 만들면 하위 useMemo(scopedFields 등)가
// 매번 무효화되므로 identity 고정 모듈 상수로.
const NO_FIELDS: never[] = [];

// 공유 미적용(스코프·선택) 화면의 첨부 표시 기본값 — identity 고정(useMemo 무효화 방지).
const DEFAULT_VISIBLE = { text: true, photo: true } as const;

// 이번 세션에서 마지막으로 보던 지도 뷰(center+level). 모듈 수명이라 화면 재마운트(탭 전환·
// 뒤로가기)에도 살아남아, 재진입 시 '내 위치'로 끌려가지 않고 마지막 위치로 복원한다.
// 스코프 화면(외근 상세)은 자기 프레이밍이 있으므로 이 값을 읽지도 쓰지도 않는다.
let lastMapView: { lat: number; lng: number; level: number } | null = null;

interface MapDashboardProps {
  // 화면별 현장 화이트리스트. undefined = 내 현장 전체.
  // 예: 외근 화면에선 그 외근에 속한 destinations 의 fieldId 만 통과시켜
  // 지도/필터/마커가 다른 현장으로 흐려지지 않도록.
  scopeFieldIds?: string[];
  // 지도 위에 깔리는 바텀시트 peek 높이(px) — 범례를 그 위로 띄우는 데 사용.
  legendBottomInset?: number;
  // 현장 선택 모드(외근 시작) — 선택된 현장 id. 마커에 brand 링+✓ 로 표시.
  selectedFieldIds?: string[];
  // 마커 탭 동작 오버라이드 — 주어지면 현장 상세 이동 대신 이 콜백으로 선택 토글.
  onSelectField?: (fieldId: string) => void;
  // 외근 방문 순서(fieldId 배열). 주어지면 그 순서로 마커에 순번을 새기고 점선 경로를 잇는다.
  // scopeFieldIds 와 별개 축 — 스코프는 '무엇을 보여줄지', 이건 '어떤 순서로 도는지'.
  routeFieldIds?: string[];
}

export function MapDashboard({
  scopeFieldIds,
  legendBottomInset,
  selectedFieldIds,
  onSelectField,
  routeFieldIds,
}: MapDashboardProps = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const directAttachmentsMap = useFieldStore((s) => s.directAttachments);
  // 지도 명령형 핸들 — '내 위치' 버튼이 드래그된 지도를 내 위치로 복구하는 데 사용.
  const mapHandleRef = useRef<KakaoMapHandle>(null);
  // 전역 지도(특정 현장 프레이밍이 없는 화면) = 복원 대상.
  // undefined(현장·보고서) 와 [](외근 목록: 빈 마커지만 같은 전역 캔버스) 둘 다 포함.
  // 실제 스코프([ids], 외근 상세)는 자기 프레이밍을 유지해야 하므로 제외.
  const isGlobalMap = !scopeFieldIds || scopeFieldIds.length === 0;
  // 마운트 시점의 마지막 뷰 — 전역 지도만 복원.
  const lastViewAtMount = useRef(isGlobalMap ? lastMapView : null).current;
  // 지도 뷰가 정착할 때마다 기억(전역 지도만) — 다음 재마운트에서 lastViewAtMount 로 복원됨.
  const handleViewChange = useCallback(
    (v: { lat: number; lng: number; level: number }) => {
      if (isGlobalMap) lastMapView = v;
    },
    [isGlobalMap],
  );

  // 탭 포커스마다 최신 공유 뷰로 동기화 — 마운트 시점 캡처만으론, 떠 있는 다른 탭이 한쪽의
  // 팬을 못 따라와 전환 시 중심이 달라 보이던 회로 차단. 전역 지도끼리는 항상 같은 위치.
  useFocusEffect(
    useCallback(() => {
      if (isGlobalMap && lastMapView) {
        mapHandleRef.current?.setView(lastMapView);
      }
    }, [isGlobalMap]),
  );

  // 표시 설정은 전역 store 공유 — 한 탭에서 바꾸면 다른 탭의 배경 지도도 같이 바뀐다.
  const sharedDisplayMode = useMapSettingsStore((s) => s.displayMode);
  const setDisplayMode = useMapSettingsStore((s) => s.setDisplayMode);
  const sharedBaseMapType = useMapSettingsStore((s) => s.baseMapType);
  const setBaseMapType = useMapSettingsStore((s) => s.setBaseMapType);
  const selectedStatuses = useMapSettingsStore((s) => s.selectedStatuses);
  const toggleStatus = useMapSettingsStore((s) => s.toggleStatus);
  const rangePreset = useMapSettingsStore((s) => s.rangePreset);
  const setRangePreset = useMapSettingsStore((s) => s.setRangePreset);
  const selectedTags = useMapSettingsStore((s) => s.selectedTags);
  const toggleTag = useMapSettingsStore((s) => s.toggleTag);
  const sharedVisibleAttachments = useMapSettingsStore((s) => s.visibleAttachments);
  const toggleAttachment = useMapSettingsStore((s) => s.toggleAttachment);
  const sharedShowBoundary = useMapSettingsStore((s) => s.showBoundary);
  const toggleBoundary = useMapSettingsStore((s) => s.toggleBoundary);

  // 공유 설정은 외근·현장 메인 탭(전역·비선택 지도)에만 적용한다. 스코프 상세·보고서 위치도는
  // 필터로 목적지가 가려지면 안 되고, 외근 시작 선택 화면은 히트맵이 되면 마커를 못 누른다 —
  // 이 화면들은 기존 안전 기본(마커·일반지도·필터 없음)을 유지해 회귀를 막는다.
  const sharesSettings = isGlobalMap && !onSelectField;
  const displayMode = sharesSettings ? sharedDisplayMode : 'markers';
  const baseMapType = sharesSettings ? sharedBaseMapType : 'roadmap';
  const showBoundary = sharesSettings ? sharedShowBoundary : false;
  const visibleAttachments = sharesSettings ? sharedVisibleAttachments : DEFAULT_VISIBLE;
  // 사용자 현재 위치 — mount 1회 fetch. 권한 거부/오류 시 null 유지 (지도는 부산 중심 fallback).
  // ref guard 로 같은 세션 내 dashboard 재 mount 마다 또 권한 prompt 가 뜨는 회로 차단.
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  // 검색에서 고른 현장 — 그 마커에 하이라이트(브랜드 링+핑). 다음 검색 선택까지 유지.
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);
  // 검색에서 고른 '새 위치'(카카오 장소) — 지도에 비컨을 찍고 등록 여부를 묻는 카드를 띄운다.
  const [pendingPlace, setPendingPlace] = useState<AddressSearchItem | null>(null);
  const locationFetchedRef = useRef(false);
  useEffect(() => {
    if (locationFetchedRef.current) return;
    locationFetchedRef.current = true;
    void requestUserLocation().then((loc) => {
      if (loc) setMyLocation(loc);
    });
  }, []);

  // allFields 는 /api/fields/mine 출처 — 백엔드가 이미 "내 현장"으로 스코프해 내려준다.
  // 따라서 클라이언트에서 현장별 owner(userId)로 재필터하지 않는다(로그인 가드만 유지).
  // Before: f.userId === userId 로 한 번 더 걸렀는데, 복사/배정으로 owner 가 내가 아닌 현장
  // (예: 데모 시드, 남이 만들어 나에게 배정)이 통째로 떨어져 지도 마커가 0이 되던 회로 차단.
  const myFields = userId ? allFields : NO_FIELDS;

  // scopeFieldIds 가 주어진 화면(외근 상세/진행 중)에선 그 외근의 현장만 통과.
  // undefined 면 전체 노출, 빈 배열이면 0개 (목적지 없는 외근의 의도적 빈 상태).
  // 스코프 모드에선 userId 필터를 우회하고 allFields 에서 id 직접 lookup —
  // 외근에 묶인 현장이 userId 동기 race 로 myFields 에서 빠져 마커가 안 보이던 회로 차단.
  const scopedFields = useMemo(() => {
    if (!scopeFieldIds) return myFields;
    const byId = new Map(allFields.map((f) => [f.id, f]));
    const out = [];
    for (const id of scopeFieldIds) {
      const f = byId.get(id);
      if (f) out.push(f);
    }
    return out;
  }, [myFields, allFields, scopeFieldIds]);

  // 가용 분류 = 카테고리 마스터 집합 ∪ 스코프된 현장에 붙은 분류(레거시 값 보존).
  const masterCategories = useCategoryStore((s) => s.categories);
  // 지도/외근 화면을 먼저 진입해도 마스터 전용 분류가 필터에 뜨도록 하이드레이트(멱등).
  useEffect(() => {
    void useCategoryStore.getState().hydrate();
  }, []);
  const availableTags = useMemo(() => {
    const fromFields: string[] = [];
    scopedFields.forEach((f) => f.categories?.forEach((t) => fromFields.push(t)));
    return mergeCategoryNames(masterCategories.map((c) => c.name), fromFields);
  }, [scopedFields, masterCategories]);

  const visibleFields = useMemo(() => {
    let list = scopedFields;
    // 스코프·선택 화면은 공유 필터를 적용하지 않는다 — 목적지/선택 후보가 가려지지 않게.
    if (!sharesSettings) return list;
    if (selectedStatuses.length > 0) {
      list = list.filter((f) => selectedStatuses.includes(f.status));
    }
    if (rangePreset !== 'all') {
      const days = rangePreset === '30d' ? 30 : rangePreset === '7d' ? 7 : 1;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      list = list.filter((f) => {
        const t = f.recentVisitedAt ?? f.updatedAt;
        if (!t) return false;
        const ms = new Date(t).getTime();
        return Number.isFinite(ms) && ms >= cutoff;
      });
    }
    if (selectedTags.length > 0) {
      list = list.filter((f) =>
        selectedTags.every((tag) => f.categories?.includes(tag)),
      );
    }
    return list;
  }, [scopedFields, sharesSettings, selectedStatuses, rangePreset, selectedTags]);

  // ERD v2: 메모·사진은 현장(field) 전용 — directAttachments 에서만 집계 (음성 폐기).
  const attachmentPresenceByField = useMemo(() => {
    const map = new Map<string, { text: boolean; photo: boolean }>();
    visibleFields.forEach((f) => {
      const direct = directAttachmentsMap[f.id] ?? [];
      map.set(f.id, {
        text: direct.some((a) => a.type === 'text'),
        photo: direct.some((a) => a.type === 'photo'),
      });
    });
    return map;
  }, [visibleFields, directAttachmentsMap]);

  // 카메라 중심 우선순위 — scoped 화면(외근 상세/진행 중)에서는 scope 클러스터 centroid 가
  // myLocation 보다 우선. 사용자가 멀리 떨어진 외근을 열 때 destination 마커가 화면 밖으로
  // 밀려 보이지 않던 회로 차단. scope 가 없거나 비어 있으면 내 위치로 폴백.
  //
  // scoped centroid 는 "1회 프레이밍" — 한 번 확정하면 고정한다. 외근 진입 후 목적지 상세가
  // 비동기로 하나씩 로드되며 scopedFields 가 커지면 centroid 값이 미세하게 흔들리는데,
  // 그 변화가 KakaoMapWebView 의 setCenter 를 재발화시켜 사용자가 드래그한 지도를 도로
  // 목적지 중심으로 끌어당기던 회로 차단. 모든 목적지가 로드되면(=완전한 프레이밍) freeze 하고,
  // 그 뒤엔 일반 지도처럼 드래그 위치가 유지된다. 스코프(scopeFieldIds)가 바뀌면 재프레이밍.
  const scopedCenterRef = useRef<{ key: string; center: LatLng } | null>(null);
  const mapCenter = useMemo(() => {
    if (scopeFieldIds && scopedFields.length > 0) {
      const key = scopeFieldIds.join(',');
      if (scopedCenterRef.current?.key === key) {
        return scopedCenterRef.current.center;
      }
      let sumLat = 0;
      let sumLng = 0;
      for (const f of scopedFields) {
        sumLat += f.latitude;
        sumLng += f.longitude;
      }
      const center = {
        lat: sumLat / scopedFields.length,
        lng: sumLng / scopedFields.length,
      };
      // 목적지가 전부 로드됐을 때만 freeze — 부분 집합으로 프레이밍한 채 굳는 것 방지.
      if (scopedFields.length === scopeFieldIds.length) {
        scopedCenterRef.current = { key, center };
      }
      return center;
    }
    // 비스코프(목록 탭): 이번 세션에서 마지막으로 보던 위치가 있으면 그걸로 초기 프레이밍.
    // 없을 때만 내 위치로 1회 프레이밍 — 재마운트마다 내 위치로 끌려오던 회로 차단.
    if (lastViewAtMount) return lastViewAtMount;
    return myLocation ?? undefined;
  }, [scopeFieldIds, scopedFields, myLocation, lastViewAtMount]);

  // 선택된 현장 집합 — 선택 모드에서만 채워짐(아니면 빈 Set → 마커에 selected 미부여).
  const selectedSet = useMemo(
    () => new Set(selectedFieldIds ?? []),
    [selectedFieldIds],
  );

  // fieldId → 방문 순번(1-based). routeFieldIds 미지정 화면(현장 탭 등)은 빈 Map → 기존 상태 마커 유지.
  const orderByFieldId = useMemo(() => {
    const m = new Map<string, number>();
    if (routeFieldIds) {
      routeFieldIds.forEach((id, i) => {
        if (!m.has(id)) m.set(id, i + 1);
      });
    }
    return m;
  }, [routeFieldIds]);

  const markers = useMemo(() => {
    const base = fieldsToMarkers(visibleFields);
    return base.map((m) => {
      const selected = selectedSet.has(m.id);
      const highlighted = m.id === highlightedFieldId;
      const presence = attachmentPresenceByField.get(m.id);
      let label = m.label;
      if (presence) {
        const tags: string[] = [];
        if (visibleAttachments.text && presence.text) tags.push('메모');
        if (visibleAttachments.photo && presence.photo) tags.push('사진');
        if (tags.length > 0) label = `${m.label} · ${tags.join('·')}`;
      }
      return { ...m, label, selected, highlighted, order: orderByFieldId.get(m.id) };
    });
  }, [
    visibleFields,
    attachmentPresenceByField,
    visibleAttachments,
    selectedSet,
    highlightedFieldId,
    orderByFieldId,
  ]);

  // 경로선 좌표 — routeFieldIds 순서대로, 좌표가 있고 실제로 보이는 현장만.
  // 스코프에서 빠졌거나 좌표가 (0,0)인 현장을 끼우면 선이 엉뚱한 곳으로 튄다.
  const route = useMemo(() => {
    if (!routeFieldIds || routeFieldIds.length < 2) return undefined;
    const byId = new Map(visibleFields.map((f) => [f.id, f]));
    const pts: { lat: number; lng: number }[] = [];
    for (const id of routeFieldIds) {
      const f = byId.get(id);
      if (!f) continue;
      if (f.latitude === 0 && f.longitude === 0) continue;
      pts.push({ lat: f.latitude, lng: f.longitude });
    }
    return pts.length >= 2 ? pts : undefined;
  }, [routeFieldIds, visibleFields]);

  return (
    // 지도가 화면 위까지 꽉 차고, 설정은 우측 상단 떠 있는 '레이어' 버튼 오버레이로.
    // (이전엔 상단에 불투명 흰 필터 바가 지도를 눌러 답답해 보이던 회로 차단.)
    <View style={styles.container}>
      <KakaoMapWebView
        ref={mapHandleRef}
        markers={markers}
        displayMode={displayMode}
        showBoundary={showBoundary}
        baseMapType={baseMapType}
        myLocation={myLocation}
        beacon={pendingPlace ? { lat: pendingPlace.lat, lng: pendingPlace.lng } : null}
        route={route}
        center={mapCenter}
        initialLevel={lastViewAtMount?.level}
        onViewChange={handleViewChange}
        onMarkerPress={(fieldId) =>
          // 선택 모드(onSelectField 주어짐)에선 토글, 아니면 현장 상세로 이동.
          onSelectField
            ? onSelectField(fieldId)
            : router.push(`/(tabs)/fields/${fieldId}` as never)
        }
      />
      <MapLegend displayMode={displayMode} bottomInset={legendBottomInset} />
      {/* 지도 상단 검색창 — 현장을 이름(주소)으로 찾아 지도를 그 위치로 이동.
          레이어 패널과 동일하게 메인 탭(외근·현장)에만 노출. */}
      {sharesSettings ? (
        <MapSearchBar
          fields={scopedFields}
          onSelectField={(f) => {
            // 내 현장 선택 — 비컨/등록 카드는 닫고 그 현장으로 이동·하이라이트.
            setPendingPlace(null);
            setHighlightedFieldId(f.id);
            mapHandleRef.current?.recenter({ lat: f.latitude, lng: f.longitude });
          }}
          onSelectPlace={(item) => {
            // 카카오 장소 = 새 위치 → 바로 등록하지 않고 그 좌표로 지도 이동 + 비컨.
            // 어디인지 확인한 뒤 카드의 '여기에 현장 등록' 으로 진행 여부를 사용자가 결정.
            setHighlightedFieldId(null);
            setPendingPlace(item);
            mapHandleRef.current?.recenter({ lat: item.lat, lng: item.lng });
          }}
        />
      ) : null}
      {/* '새 위치' 비컨 확인 카드 — 검색창 아래에 떠서, 비컨 위치를 확인하고 등록 여부를 결정. */}
      {sharesSettings && pendingPlace ? (
        <View
          style={[styles.placeCard, { top: insets.top + spacing.sm + 44 + spacing.sm }]}
        >
          <View style={styles.placeCardRow}>
            <Ionicons name="location" size={18} color={colors.primary} />
            <View style={styles.placeCardText}>
              <Text variant="bodySm" weight="semibold" numberOfLines={1}>
                {pendingPlace.buildingName ||
                  pendingPlace.roadAddress ||
                  pendingPlace.jibunAddress}
              </Text>
              {pendingPlace.buildingName && pendingPlace.roadAddress ? (
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {pendingPlace.roadAddress}
                </Text>
              ) : pendingPlace.jibunAddress &&
                pendingPlace.jibunAddress !== pendingPlace.roadAddress ? (
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {pendingPlace.jibunAddress}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setPendingPlace(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="위치 선택 닫기"
            >
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              const p = pendingPlace;
              setPendingPlace(null);
              // 등록 화면이 좌표로 진입 후 역지오코딩으로 주소를 채운다(기존 fields/new 흐름 재사용).
              router.push({
                pathname: '/(tabs)/fields/new',
                params: { lat: String(p.lat), lng: String(p.lng) },
              } as never);
            }}
            style={({ pressed }) => [
              styles.placeRegisterBtn,
              pressed && styles.placeRegisterBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="이 위치에 현장 등록"
          >
            <Ionicons name="add" size={18} color={colors.onPrimary} />
            <Text variant="bodySm" weight="bold" color="onPrimary">
              여기에 현장 등록
            </Text>
          </Pressable>
        </View>
      ) : null}
      {/* 내 위치로 복구 — 우측 하단 조준점 버튼. 시트 peek 위로 띄움. */}
      <Pressable
        onPress={() => mapHandleRef.current?.recenter()}
        style={({ pressed }) => [
          styles.locateBtn,
          { bottom: (legendBottomInset ?? 0) + spacing.md },
          pressed && styles.locateBtnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="내 위치로 지도 이동"
      >
        <Ionicons name="locate" size={22} color={colors.text} />
      </Pressable>
      {/* 레이어 설정 패널은 공유 설정을 쓰는 메인 탭(외근·현장)에만 — 스코프·선택 화면은
          작업 집중 위해 숨긴다(여기서 토글하면 전역 store 가 바뀌어 혼란하므로). */}
      {sharesSettings ? (
        <MapFilterBar
          displayMode={displayMode}
          onChangeDisplayMode={setDisplayMode}
          baseMapType={baseMapType}
          onChangeBaseMapType={setBaseMapType}
          selectedStatuses={selectedStatuses}
          onToggleStatus={toggleStatus}
          rangePreset={rangePreset}
          onChangeRangePreset={setRangePreset}
          availableTags={availableTags}
          selectedTags={selectedTags}
          onToggleTag={toggleTag}
          visibleAttachments={visibleAttachments}
          onToggleAttachment={toggleAttachment}
          showBoundary={showBoundary}
          onToggleBoundary={toggleBoundary}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  placeCard: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...elevation.raised,
  },
  placeCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  placeCardText: { flex: 1 },
  placeRegisterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  placeRegisterBtnPressed: { opacity: 0.85 },
  locateBtn: {
    position: 'absolute',
    right: spacing.lg,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.raised,
  },
  locateBtnPressed: { backgroundColor: colors.surfaceMuted },
});
