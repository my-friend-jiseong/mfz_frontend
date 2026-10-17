import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import {
  KakaoMapWebView,
  fieldsToMarkers,
  type KakaoMapHandle,
} from '@/components/KakaoMapWebView';
import { MapLegend } from '@/components/MapLegend';
import { peekUserLocation, type LatLng } from '@/utils/geolocation';
import { MapSettingsSheet } from '@/components/map/MapSettingsSheet';
import { SearchBar } from '@/components/ui/SearchBar';
import { MapButton } from '@/components/ui/MapButton';
import { useMapSettingsStore } from '@/stores/mapSettingsStore';
import { filterMapFields, hasMapFilter, parseYmd } from '@/utils/visitRange';
import { useToday } from '@/utils/useToday';
import { useLocationPermission, useLocationPermissionStore } from '@/stores/locationPermissionStore';
import { fieldActionStatus } from '@/utils/fieldStatus';
import { c2, space } from '@/theme/v2';
import { useCategoryStore } from '@/stores/categoryStore';
import { fieldTitle, mergeCategoryNames } from '@/utils/fieldFacets';
import { districtOf } from '@/utils/addressFormat';

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
  // backend-backlog §22 — 실도로 경로 좌표열(백엔드 카카오모빌리티 프록시 응답의 vertexes).
  // 주어지면 routeFieldIds 로 만든 직선 대신 이걸 그린다. 순번 마커는 routeFieldIds 가 계속 담당 —
  // 두 축이 다르다: 이건 '어떤 길로 가는지', routeFieldIds 는 '어떤 순서로 도는지'.
  routeVertexes?: { lat: number; lng: number }[];
  // 스코프가 걸려도 메인 탭의 지도 크롬(검색창·레이어 패널·표시 설정)을 유지한다.
  // 외근 목록의 '지도에서 보기' 는 상세 화면이 아니라 메인 탭 안의 임시 포커스라, 토글 한 번에
  // 검색창·레이어 버튼이 사라지고 히트맵 설정이 마커로 리셋되면 고장으로 보인다.
  keepGlobalChrome?: boolean;
  /**
   * 2차 지도 크롬(1 지도): 검색창은 4 현장 검색으로 가는 입구, 옆에 지도 설정(1-3), 2차 핀(최근 조치 상태 색).
   * 위치는 앱을 열 때 묻지 않고(1-1), 권한이 없으면 내 위치 버튼이 꺼진 모양 — 누르면 onLocationOff(1-2).
   */
  v2: {
    onSearchPress: () => void;
    onLocationOff: () => void;
    /** 내 위치 버튼의 화면 아래 기준 위치(시트 위 16). */
    locateBottom: number;
  };
}

export function MapDashboard({
  scopeFieldIds,
  legendBottomInset,
  selectedFieldIds,
  onSelectField,
  routeFieldIds,
  routeVertexes,
  keepGlobalChrome = false,
  v2,
}: MapDashboardProps) {
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
  const visitRange = useMapSettingsStore((s) => s.visitRange);
  const setVisitRange = useMapSettingsStore((s) => s.setVisitRange);
  const selectedTags = useMapSettingsStore((s) => s.selectedTags);
  const toggleTag = useMapSettingsStore((s) => s.toggleTag);
  const sharedVisibleAttachments = useMapSettingsStore((s) => s.visibleAttachments);
  const sharedShowBoundary = useMapSettingsStore((s) => s.showBoundary);
  const setStatuses = useMapSettingsStore((s) => s.setStatuses);
  const resetSettings = useMapSettingsStore((s) => s.reset);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 공유 설정은 외근·현장 메인 탭(전역·비선택 지도)에만 적용한다. 스코프 상세·보고서 위치도는
  // 필터로 목적지가 가려지면 안 되고, 외근 시작 선택 화면은 히트맵이 되면 마커를 못 누른다 —
  // 이 화면들은 기존 안전 기본(마커·일반지도·필터 없음)을 유지해 회귀를 막는다.
  // keepGlobalChrome 은 예외 — 메인 탭 안의 임시 포커스(외근 목록 '지도에서 보기')는 스코프가
  // 걸려도 크롬·표시 설정을 그대로 둔다. 단 이때 공유 필터가 함께 살아나 목적지가 가려질 수 있어,
  // 아래 route 는 visibleFields 가 아니라 scopedFields 로 계산한다(경로선이 질러가지 않게).
  const sharesSettings = (isGlobalMap || keepGlobalChrome) && !onSelectField;
  const displayMode = sharesSettings ? sharedDisplayMode : 'markers';
  const baseMapType = sharesSettings ? sharedBaseMapType : 'roadmap';
  const showBoundary = sharesSettings ? sharedShowBoundary : false;
  const visibleAttachments = sharesSettings ? sharedVisibleAttachments : DEFAULT_VISIBLE;
  // 사용자 현재 위치 — mount 1회 fetch. 권한 거부/오류 시 null 유지 (지도는 부산 중심 fallback).
  // ref guard 로 같은 세션 내 dashboard 재 mount 마다 또 권한 prompt 가 뜨는 회로 차단.
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);

  // 2차(1-1·1-2): 권한 상태를 보고 허용됐을 때만 위치를 읽는다. 1-2 에서 허용하고 돌아오면 내 위치로 옮긴다.
  const permission = useLocationPermission();
  const recenterAfterGrantRef = useRef(false);
  useEffect(() => {
    if (permission !== 'granted') return;
    let alive = true;
    void peekUserLocation().then((loc) => {
      if (!alive || !loc) return;
      setMyLocation(loc);
      if (recenterAfterGrantRef.current) {
        recenterAfterGrantRef.current = false;
        mapHandleRef.current?.recenter(loc);
      }
    });
    return () => {
      alive = false;
    };
  }, [permission]);
  // 1-2 를 허용 없이 닫으면(나중에·스크림) 다음 허용 때 엉뚱하게 내 위치로 끌려가지 않게 잊는다.
  const permissionSheetOpen = useLocationPermissionStore((s) => s.sheetOpen);
  useEffect(() => {
    if (!permissionSheetOpen && permission !== 'granted') recenterAfterGrantRef.current = false;
  }, [permissionSheetOpen, permission]);
  const locationOff = permission === 'off' || permission === 'blocked';
  const onLocatePress = () => {
    if (!locationOff) {
      mapHandleRef.current?.recenter();
      return;
    }
    recenterAfterGrantRef.current = true;
    v2.onLocationOff();
  };

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

  // 자정이 지나면 '최근 방문일' 기준도 넘어가게(useSharedMapSettings 와 같다).
  const today = useToday();
  const visibleFields = useMemo(() => {
    // 스코프·선택 화면은 공유 필터를 적용하지 않는다 — 목적지/선택 후보가 가려지지 않게.
    if (!sharesSettings) return scopedFields;
    return filterMapFields(scopedFields, { statuses: selectedStatuses, range: visitRange, tags: selectedTags }, parseYmd(today));
  }, [scopedFields, sharesSettings, selectedStatuses, visitRange, selectedTags, today]);

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
    // 2차 핀: 최근 조치 상태 색(fieldActionStatus). 핀 종류가 색을 정한다.
    const pinOf = new Map(visibleFields.map((f) => [f.id, fieldActionStatus(f)]));
    const fieldOf = new Map(visibleFields.map((f) => [f.id, f]));
    return base.map((m) => {
      const selected = selectedSet.has(m.id);
      const presence = attachmentPresenceByField.get(m.id);
      let label = m.label;
      if (presence) {
        const tags: string[] = [];
        if (visibleAttachments.text && presence.text) tags.push('메모');
        if (visibleAttachments.photo && presence.photo) tags.push('사진');
        if (tags.length > 0) label = `${m.label} · ${tags.join('·')}`;
      }
      const f = fieldOf.get(m.id);
      // 2차 핀은 라벨을 지도에 그리지 않는다 — 겹친 핀 고르기 시트의 이름·구동으로 쓴다.
      const named = f ? { label: fieldTitle(f), sublabel: districtOf(f.address) } : { label };
      return { ...m, ...named, selected, order: orderByFieldId.get(m.id), pin: pinOf.get(m.id) };
    });
  }, [
    visibleFields,
    attachmentPresenceByField,
    visibleAttachments,
    selectedSet,
    orderByFieldId,
  ]);

  // 경로선 좌표 — routeFieldIds 순서대로, 스코프에 있고 좌표가 있는 현장만.
  // 기준을 visibleFields 가 아니라 scopedFields 로 두는 이유: keepGlobalChrome 이면 공유
  // 필터(상태·기간·분류)가 살아 있어 중간 목적지가 마커에서 빠질 수 있는데, 그때 경로선까지
  // 그 점을 건너뛰면 실제로 가지 않은 지름길이 그려진다. 동선은 필터와 무관한 사실이므로 고정.
  // §22: 실도로 좌표열이 있으면 그쪽이 우선. 직선 계산은 폴백으로 남긴다 —
  // 경로 API 실패(503 등)와 routeFieldIds 만 주는 화면(외근 상세)이 계속 이 경로를 탄다.
  const route = useMemo(() => {
    if (routeVertexes && routeVertexes.length >= 2) return routeVertexes;
    if (!routeFieldIds || routeFieldIds.length < 2) return undefined;
    const byId = new Map(scopedFields.map((f) => [f.id, f]));
    const pts: { lat: number; lng: number }[] = [];
    for (const id of routeFieldIds) {
      const f = byId.get(id);
      if (!f) continue;
      if (f.latitude === 0 && f.longitude === 0) continue;
      pts.push({ lat: f.latitude, lng: f.longitude });
    }
    return pts.length >= 2 ? pts : undefined;
  }, [routeVertexes, routeFieldIds, scopedFields]);

  // 1-3 지도 설정 시트.
  const settingsProps = {
    displayMode,
    onChangeDisplayMode: setDisplayMode,
    baseMapType,
    onChangeBaseMapType: setBaseMapType,
    selectedStatuses,
    onChangeStatuses: setStatuses,
    visitRange,
    onChangeVisitRange: setVisitRange,
    availableTags,
    selectedTags,
    onToggleTag: toggleTag,
    visibleCount: visibleFields.length,
    onReset: resetSettings,
  };
  const settingsChanged =
    displayMode !== 'markers' ||
    baseMapType !== 'roadmap' ||
    hasMapFilter({ statuses: selectedStatuses, range: visitRange, tags: selectedTags });

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
        route={route}
        center={mapCenter}
        initialLevel={lastViewAtMount?.level}
        onViewChange={handleViewChange}
        onMarkerPress={(fieldId) =>
          // 선택 모드(onSelectField 주어짐)에선 토글, 아니면 현장 상세로 이동.
          onSelectField
            ? onSelectField(fieldId)
            : router.push(`/(tabs)/trips/fields/${fieldId}` as never)
        }
      />
      <MapLegend displayMode={displayMode} bottomInset={legendBottomInset} />
      {/* 1 지도 위쪽: 4 현장 검색으로 가는 검색창 + 지도 설정(1-3). */}
      <View style={[styles.v2Top, { top: insets.top + space[8] }]} pointerEvents="box-none">
        <SearchBar value="" onPressLauncher={v2.onSearchPress} style={styles.v2Search} />
        {sharesSettings ? (
          <MapButton
            icon="layers"
            size={52}
            dot={settingsChanged}
            accessibilityLabel="지도 설정"
            onPress={() => setSettingsOpen(true)}
          />
        ) : null}
      </View>
      <MapButton
        icon={locationOff ? 'locate-off' : 'locate'}
        accessibilityLabel={locationOff ? '위치 권한 꺼짐 — 내 위치 켜기' : '내 위치로 지도 이동'}
        onPress={onLocatePress}
        style={[styles.v2Locate, { bottom: v2.locateBottom }]}
      />
      {/* 지도 설정은 공유 설정을 쓰는 메인 탭에만 — 스코프·선택 화면은 작업 집중 위해 숨긴다
          (여기서 바꾸면 전역 store 가 바뀌어 혼란하므로). */}
      {sharesSettings ? (
        <MapSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} {...settingsProps} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c2.bg.canvas },
  v2Top: {
    position: 'absolute',
    left: space[16],
    right: space[16],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
  },
  v2Search: { flex: 1 },
  v2Locate: { position: 'absolute', right: space[16] },
});
