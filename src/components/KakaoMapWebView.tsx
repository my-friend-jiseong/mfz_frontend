import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildKakaoMapHtml, type MapDisplayMode } from '@/assets/kakaoMapHtml';
import {
  loadSigunguGeoJson,
  aggregateByRegion,
  opacityForCount,
  getBoundaryRings,
} from '@/assets/boundaries/sigungu';
import { KAKAO_WEBVIEW_BASE_URL } from '@/utils/kakaoMap';
import type { Field, FieldStatus } from '@/types/entities';
import { FIELD_STATUS_LABEL } from '@/types/entities';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { elevation } from '@/theme/elevation';
import { spacing, radius } from '@/theme/spacing';
import { groupSameLocationMarkers } from '@/utils/groupSameLocationMarkers';

// KWCAG 1.4.1 — 색 단독 의미 전달 금지. status 별 색 + 형상 + 라벨 3중 인코딩.
export type MarkerShape = 'triangle' | 'circle' | 'check';

const STATUS_TO_SHAPE: Record<FieldStatus, MarkerShape> = {
  pending: 'triangle',
  in_progress: 'circle',
  done: 'check',
};

const STATUS_TO_BADGE: Record<FieldStatus, string> = FIELD_STATUS_LABEL;

export interface KakaoMapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
  shape?: MarkerShape;
  badge?: string;
}

interface Props {
  markers: KakaoMapMarker[];
  center?: { lat: number; lng: number };
  displayMode?: MapDisplayMode;
  showBoundary?: boolean;
  // 사용자 현재 위치 — 있으면 파란 점 + pulse 링으로 노출 (클릭 비활성).
  myLocation?: { lat: number; lng: number } | null;
  // true 면 모든 마커가 한 화면에 들어오도록 자동 프레이밍 (center 무시). 위치도 미리보기용.
  fitToMarkers?: boolean;
  // false 면 드래그/줌 비활성 — BottomSheet 안 등 pan 충돌 회피용 정적 위치도.
  interactive?: boolean;
  onMarkerPress?: (fieldId: string) => void;
}

const DEFAULT_CENTER = { lat: 35.17, lng: 129.07 }; // 부산 중심

export function KakaoMapWebView({
  markers,
  center,
  displayMode = 'markers',
  showBoundary = false,
  myLocation = null,
  fitToMarkers = false,
  interactive = true,
  onMarkerPress,
}: Props) {
  const webRef = useRef<WebView>(null);
  const [activeGroup, setActiveGroup] = useState<KakaoMapMarker[] | null>(null);

  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

  // 동일 좌표 마커는 head 1개로 압축하고 count/groupIds 메타를 첨부 → HTML 측은 단순히 표시만.
  const groupedMarkers = useMemo(() => {
    return groupSameLocationMarkers(markers).map((group) => ({
      ...group[0],
      count: group.length,
      groupIds: group.length > 1 ? group.map((m) => m.id) : undefined,
    }));
  }, [markers]);

  // 경계·단계구분도 지오메트리는 번들 소스에서 — 런타임 fetch/CDN 없이 오프라인 동작.
  // 외곽 링은 정적이라 모드 진입 시 1회 추출(내부 캐시), code별 채색은 마커 집계로 계산.
  const needsBoundary = showBoundary || displayMode === 'choropleth';
  const boundaryRings = useMemo(
    () => (needsBoundary ? getBoundaryRings() : undefined),
    [needsBoundary],
  );
  const regionFill = useMemo(() => {
    if (displayMode !== 'choropleth') return undefined;
    const counts = aggregateByRegion(
      markers.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })),
      loadSigunguGeoJson(),
    );
    const max = Math.max(0, ...Array.from(counts.values()));
    const fill: Record<string, number> = {};
    counts.forEach((c, code) => {
      fill[code] = opacityForCount(c, max);
    });
    return fill;
  }, [displayMode, markers]);

  // html 빌더 deps 에서 center·myLocation 제거 — 비동기 도착(권한 응답) 시 source 전체
  // 재주입으로 사용자의 pan/zoom/InfoWindow 가 reset 되던 회로 차단. 초기 1회만 HTML 에 박고,
  // 이후 변경은 injectJavaScript 로 in-place 업데이트.
  // initialCenter/initialMyLocation 은 mount 시점 값으로만 의미 — ref 에 박아 deps 에서 제외.
  const initialCenterRef = useRef(center ?? myLocation ?? DEFAULT_CENTER);
  const initialMyLocationRef = useRef(myLocation);
  const html = useMemo(
    () =>
      buildKakaoMapHtml({
        kakaoJsKey,
        markers: groupedMarkers,
        center: initialCenterRef.current,
        displayMode,
        showBoundary,
        myLocation: initialMyLocationRef.current,
        fitToMarkers,
        interactive,
        boundaryRings,
        regionFill,
      }),
    [
      kakaoJsKey,
      groupedMarkers,
      displayMode,
      showBoundary,
      fitToMarkers,
      interactive,
      boundaryRings,
      regionFill,
    ],
  );

  // 후속 center 변경 → in-place setCenter (pan/zoom 보존).
  useEffect(() => {
    if (!center) return;
    const js = `if(window.__mfzMap){window.__mfzMap.setCenter(new kakao.maps.LatLng(${center.lat},${center.lng}));}true;`;
    webRef.current?.injectJavaScript(js);
  }, [center?.lat, center?.lng]);

  // 후속 myLocation 변경 → in-place 마커 갱신.
  useEffect(() => {
    const payload = myLocation
      ? `{lat:${myLocation.lat},lng:${myLocation.lng}}`
      : 'null';
    const js = `if(window.__mfzSetMyLocation){window.__mfzSetMyLocation(${payload});}true;`;
    webRef.current?.injectJavaScript(js);
  }, [myLocation?.lat, myLocation?.lng]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: KAKAO_WEBVIEW_BASE_URL }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="compatibility"
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'markerPress' && typeof msg.fieldId === 'string') {
              onMarkerPress?.(msg.fieldId);
            } else if (msg.type === 'markerGroupPress' && Array.isArray(msg.groupIds)) {
              const ids = new Set<string>(msg.groupIds);
              const group = markers.filter((m) => ids.has(m.id));
              if (group.length > 0) setActiveGroup(group);
            }
          } catch {
            // ignore
          }
        }}
        style={styles.web}
      />
      <Modal
        visible={activeGroup !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveGroup(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setActiveGroup(null)}
        >
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation()}
          >
            <Text variant="body" weight="bold" style={styles.modalTitle}>
              이 위치의 현장 {activeGroup?.length ?? 0}건
            </Text>
            <ScrollView style={styles.modalList}>
              {activeGroup?.map((m) => (
                <Pressable
                  key={m.id}
                  style={({ pressed }) => [
                    styles.modalItem,
                    pressed && styles.modalItemPressed,
                  ]}
                  onPress={() => {
                    setActiveGroup(null);
                    onMarkerPress?.(m.id);
                  }}
                >
                  {m.badge ? (
                    <View
                      style={[styles.modalItemBadge, { backgroundColor: m.color }]}
                    >
                      <Text variant="caption" weight="bold" color="onPrimary">
                        {m.badge}
                      </Text>
                    </View>
                  ) : null}
                  <Text variant="bodySm" style={styles.modalItemLabel} numberOfLines={1}>
                    {m.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// 주소를 라벨용 짧은 식별자로 — 마지막 2 토큰(도로명 + 번지) 우선, 길이 한도 18자.
// Before: 마지막 1 토큰만 ('264' 같은 번지수만 라벨이 되던 회로)
function shortLabelOf(address: string): string {
  const tokens = address.trim().split(/\s+/);
  if (tokens.length === 0) return '현장';
  const tail = tokens.length >= 2 ? tokens.slice(-2).join(' ') : tokens[tokens.length - 1];
  return tail.length > 18 ? `${tail.slice(0, 17)}…` : tail;
}

export function fieldsToMarkers(fields: Field[]): KakaoMapMarker[] {
  return fields.map((f) => ({
    id: f.id,
    lat: f.latitude,
    lng: f.longitude,
    label: shortLabelOf(f.address),
    color: colors.fieldStatus[f.status],
    shape: STATUS_TO_SHAPE[f.status],
    badge: STATUS_TO_BADGE[f.status],
  }));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  web: { flex: 1, backgroundColor: 'transparent' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...elevation.modal,
  },
  modalTitle: { marginBottom: spacing.md },
  modalList: { maxHeight: 360 },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  modalItemPressed: { backgroundColor: colors.background },
  modalItemBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  modalItemLabel: { flex: 1 },
});
