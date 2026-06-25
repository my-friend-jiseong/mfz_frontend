import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import {
  KakaoMapWebView,
  fieldsToMarkers,
  type KakaoMapHandle,
} from '@/components/KakaoMapWebView';
import { MapLegend } from '@/components/MapLegend';
import { elevation } from '@/theme/elevation';
import { spacing } from '@/theme/spacing';
import { requestUserLocation, type LatLng } from '@/utils/geolocation';
import {
  MapFilterBar,
  type DisplayMode,
  type BaseMapType,
  type AttachmentKind,
  type VisibleAttachments,
  type RangePreset,
} from '@/components/MapFilterBar';
import type { FieldStatus } from '@/types/entities';
import { colors } from '@/theme/colors';

// 비로그인 시 myFields — 렌더마다 새 [] 를 만들면 하위 useMemo(scopedFields 등)가
// 매번 무효화되므로 identity 고정 모듈 상수로.
const NO_FIELDS: never[] = [];

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
}

export function MapDashboard({
  scopeFieldIds,
  legendBottomInset,
  selectedFieldIds,
  onSelectField,
}: MapDashboardProps = {}) {
  const router = useRouter();
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

  const [displayMode, setDisplayMode] = useState<DisplayMode>('markers');
  const [baseMapType, setBaseMapType] = useState<BaseMapType>('roadmap');
  const [selectedStatuses, setSelectedStatuses] = useState<FieldStatus[]>([]);
  const [rangePreset, setRangePreset] = useState<RangePreset>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [visibleAttachments, setVisibleAttachments] = useState<VisibleAttachments>({
    text: true,
    photo: true,
  });
  const [showBoundary, setShowBoundary] = useState(false);
  // 사용자 현재 위치 — mount 1회 fetch. 권한 거부/오류 시 null 유지 (지도는 부산 중심 fallback).
  // ref guard 로 같은 세션 내 dashboard 재 mount 마다 또 권한 prompt 가 뜨는 회로 차단.
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
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

  // 가용 분류 — 스코프된 현장에 등록된 분류(field_categories) 합집합 (정렬)
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    scopedFields.forEach((f) => f.categories?.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [scopedFields]);

  const visibleFields = useMemo(() => {
    let list = scopedFields;
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
  }, [scopedFields, selectedStatuses, rangePreset, selectedTags]);

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

  const markers = useMemo(() => {
    const base = fieldsToMarkers(visibleFields);
    return base.map((m) => {
      const selected = selectedSet.has(m.id);
      const presence = attachmentPresenceByField.get(m.id);
      if (!presence) return selected ? { ...m, selected } : m;
      const tags: string[] = [];
      if (visibleAttachments.text && presence.text) tags.push('메모');
      if (visibleAttachments.photo && presence.photo) tags.push('사진');
      const label = tags.length > 0 ? `${m.label} · ${tags.join('·')}` : m.label;
      return { ...m, label, selected };
    });
  }, [visibleFields, attachmentPresenceByField, visibleAttachments, selectedSet]);

  const toggleStatus = (s: FieldStatus) =>
    setSelectedStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  const toggleTag = (tag: string) =>
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
    );

  const toggleAttachment = (kind: AttachmentKind) =>
    setVisibleAttachments((prev) => ({ ...prev, [kind]: !prev[kind] }));

  const toggleBoundary = () => setShowBoundary((v) => !v);

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
