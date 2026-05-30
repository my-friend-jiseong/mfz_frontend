import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFieldStore } from '@/stores/fieldStore';
import { useAuthStore } from '@/stores/authStore';
import { KakaoMapWebView, fieldsToMarkers } from '@/components/KakaoMapWebView';
import { requestUserLocation, type LatLng } from '@/utils/geolocation';
import {
  MapFilterBar,
  type DisplayMode,
  type AttachmentKind,
  type VisibleAttachments,
  type RangePreset,
} from '@/components/MapFilterBar';
import type { FieldStatus } from '@/types/entities';
import { colors } from '@/theme/colors';

interface MapDashboardProps {
  // 화면별 현장 화이트리스트. undefined = 내 현장 전체.
  // 예: 외근 화면에선 그 외근에 속한 destinations 의 fieldId 만 통과시켜
  // 지도/필터/마커가 다른 현장으로 흐려지지 않도록.
  scopeFieldIds?: string[];
}

export function MapDashboard({ scopeFieldIds }: MapDashboardProps = {}) {
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const allFields = useFieldStore((s) => s.fields);
  const directAttachmentsMap = useFieldStore((s) => s.directAttachments);

  const [displayMode, setDisplayMode] = useState<DisplayMode>('markers');
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

  const myFields = useMemo(
    () => (userId ? allFields.filter((f) => f.userId === userId) : []),
    [allFields, userId],
  );

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
  const mapCenter = useMemo(() => {
    if (scopeFieldIds && scopedFields.length > 0) {
      let sumLat = 0;
      let sumLng = 0;
      for (const f of scopedFields) {
        sumLat += f.latitude;
        sumLng += f.longitude;
      }
      return {
        lat: sumLat / scopedFields.length,
        lng: sumLng / scopedFields.length,
      };
    }
    return myLocation ?? undefined;
  }, [scopeFieldIds, scopedFields, myLocation]);

  const markers = useMemo(() => {
    const base = fieldsToMarkers(visibleFields);
    return base.map((m) => {
      const presence = attachmentPresenceByField.get(m.id);
      if (!presence) return m;
      const tags: string[] = [];
      if (visibleAttachments.text && presence.text) tags.push('메모');
      if (visibleAttachments.photo && presence.photo) tags.push('사진');
      return tags.length > 0
        ? { ...m, label: `${m.label} · ${tags.join('·')}` }
        : m;
    });
  }, [visibleFields, attachmentPresenceByField, visibleAttachments]);

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
    <View style={styles.container}>
      <MapFilterBar
        displayMode={displayMode}
        onChangeDisplayMode={setDisplayMode}
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
      <View style={styles.mapBox}>
        <KakaoMapWebView
          markers={markers}
          displayMode={displayMode}
          showBoundary={showBoundary}
          myLocation={myLocation}
          center={mapCenter}
          onMarkerPress={(fieldId) =>
            router.push(`/(tabs)/fields/${fieldId}` as never)
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapBox: { flex: 1 },
});
