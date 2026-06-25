import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import {
  buildKakaoMapHtml,
  type MapDisplayMode,
  type BaseMapType,
} from '@/assets/kakaoMapHtml';
import {
  loadSigunguGeoJson,
  aggregateByRegion,
  getBoundaryRings,
} from '@/assets/boundaries/sigungu';
import { fillOpacityForCount } from '@/theme/choroplethScale';
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
  // 현장 선택 모드 — true 면 마커에 brand 링+✓ 오버레이(상태색은 유지). (외근 시작 현장 선택)
  selected?: boolean;
  // 검색 결과 하이라이트 — true 면 마커에 brand 링+핑 펄스(selected 와 독립).
  highlighted?: boolean;
}

interface Props {
  markers: KakaoMapMarker[];
  center?: { lat: number; lng: number };
  // 초기 줌 레벨 — 마지막 뷰 복원용(미지정 시 8). center 와 함께 마운트 시 1회만 사용.
  initialLevel?: number;
  displayMode?: MapDisplayMode;
  showBoundary?: boolean;
  // 베이스 지도 종류 — 일반/위성/하이브리드(미지정 시 일반). 데이터 오버레이(displayMode)와 직교.
  baseMapType?: BaseMapType;
  // 사용자 현재 위치 — 있으면 파란 점 + pulse 링으로 노출 (클릭 비활성).
  myLocation?: { lat: number; lng: number } | null;
  // 지도 뷰(center+level)가 정착할 때마다 보고 — 상위가 기억해 재마운트 시 복원에 사용.
  onViewChange?: (view: { lat: number; lng: number; level: number }) => void;
  // true 면 모든 마커가 한 화면에 들어오도록 자동 프레이밍 (center 무시). 위치도 미리보기용.
  fitToMarkers?: boolean;
  // false 면 드래그/줌 비활성 — BottomSheet 안 등 pan 충돌 회피용 정적 위치도.
  interactive?: boolean;
  onMarkerPress?: (fieldId: string) => void;
  // 타일 페인트 완료 — 보고서 위치도 네이티브 캡처 타이밍용(초기·pan/zoom 마다 발화).
  onTilesLoaded?: () => void;
}

const DEFAULT_CENTER = { lat: 35.17, lng: 129.07 }; // 부산 중심

// 외부(예: '내 위치' 버튼·탭 포커스 동기화)에서 지도를 명령형으로 제어하기 위한 핸들.
export interface KakaoMapHandle {
  // target 미지정 시 myLocation > center > 기본(부산) 순으로 복구. 멀리 줌아웃돼 있으면 적당히 당김.
  recenter: (target?: { lat: number; lng: number }) => void;
  // center+level 을 정확히(애니메이션 없이) 즉시 설정 — 탭 포커스 시 마지막 공유 뷰로 동기화용.
  setView: (view: { lat: number; lng: number; level: number }) => void;
}

export const KakaoMapWebView = forwardRef<KakaoMapHandle, Props>(
  function KakaoMapWebView(
    {
      markers,
      center,
      initialLevel,
      displayMode = 'markers',
      showBoundary = false,
      baseMapType = 'roadmap',
      myLocation = null,
      fitToMarkers = false,
      interactive = true,
      onMarkerPress,
      onTilesLoaded,
      onViewChange,
    }: Props,
    ref,
  ) {
  const webRef = useRef<WebView>(null);
  const [activeGroup, setActiveGroup] = useState<KakaoMapMarker[] | null>(null);

  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

  // 동일 좌표 군집 — 히트맵 가중치(value=count)용. 마커 표시 클러스터링은 webview 가 줌별로 따로 한다.
  const groupedMarkers = useMemo(() => {
    return groupSameLocationMarkers(markers).map((group) => ({
      ...group[0],
      count: group.length,
      groupIds: group.length > 1 ? group.map((m) => m.id) : undefined,
    }));
  }, [markers]);

  // 경계·단계구분도 지오메트리는 번들 소스에서 — 런타임 fetch/CDN 없이 오프라인 동작.
  // 외곽 링은 정적이라 모드 진입 시 1회 추출(내부 캐시), code별 채색은 마커 집계로 계산.
  // 둘 다 렌더 단계라 throw 가 화면을 깨므로 try 로 감싸 실패 시 미주입(경계/채색 생략)으로 폴백.
  const needsBoundary = showBoundary || displayMode === 'choropleth';
  const boundaryRings = useMemo(() => {
    if (!needsBoundary) return undefined;
    try {
      return getBoundaryRings();
    } catch (e) {
      console.error('경계 지오메트리 로드 실패', e);
      return undefined;
    }
  }, [needsBoundary]);
  const regionFill = useMemo(() => {
    if (displayMode !== 'choropleth') return undefined;
    try {
      const counts = aggregateByRegion(
        markers.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })),
        loadSigunguGeoJson(),
      );
      const fill: Record<string, number> = {};
      counts.forEach((c, code) => {
        fill[code] = fillOpacityForCount(c);
      });
      return fill;
    } catch (e) {
      console.error('단계구분도 집계 실패', e);
      return undefined;
    }
  }, [displayMode, markers]);

  // HTML 은 마운트당 1회만 빌드(정적). 마커·모드·경계·채색·현재위치·center 는 모두 ready 후
  // injectJavaScript 로 in-place 주입한다 — 마커 변경(필터)마다 문서를 리로드하던 회로 차단으로
  // pan/zoom 보존 + 경계 지오메트리(~3MB) 재직렬화·전체 리로드 회피.
  // markers/center 는 placeholder·초기 프레이밍용 mount 시점 값만 HTML 에 박는다(deps 제외).
  const initialCenterRef = useRef(center ?? myLocation ?? DEFAULT_CENTER);
  const initialLevelRef = useRef(initialLevel);
  // webview 가 줌별 픽셀 클러스터링을 직접 하므로 원본(미그룹) 마커를 넘긴다.
  const initialMarkersRef = useRef(markers);
  const html = useMemo(
    () =>
      buildKakaoMapHtml({
        kakaoJsKey,
        markers: initialMarkersRef.current,
        center: initialCenterRef.current,
        level: initialLevelRef.current,
        fitToMarkers,
        interactive,
      }),
    [kakaoJsKey, fitToMarkers, interactive],
  );

  // html 이 바뀌면(키/interactive/fitToMarkers) WebView 가 리로드되므로 ready 를 내려, 새 문서에 재주입.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(false);
  }, [html]);

  const inject = useCallback((js: string) => {
    webRef.current?.injectJavaScript(`${js};true;`);
  }, []);

  // 명령형 복구 — '내 위치' 버튼이 사용자가 드래그한 지도를 다시 내 위치로 끌어온다.
  // center prop 재대입은 같은 값이면 effect 가 안 도므로(드래그 후 무반응) imperative 로 처리.
  useImperativeHandle(
    ref,
    () => ({
      recenter: (target) => {
        const t = target ?? myLocation ?? center ?? DEFAULT_CENTER;
        inject(
          `window.__mfzMap&&(function(m){var ll=new kakao.maps.LatLng(${t.lat},${t.lng});if(m.getLevel()>6)m.setLevel(5);m.panTo(ll);})(window.__mfzMap)`,
        );
      },
      setView: (view) => {
        inject(
          `window.__mfzMap&&(window.__mfzMap.setLevel(${view.level}),window.__mfzMap.setCenter(new kakao.maps.LatLng(${view.lat},${view.lng})))`,
        );
      },
    }),
    [myLocation, center, inject],
  );

  // 마커 — 원본 배열 주입(클러스터링은 webview 가 줌별로 수행). 변경마다 in-place 재렌더.
  useEffect(() => {
    if (!ready) return;
    inject(
      `window.__mfzSetMarkers&&window.__mfzSetMarkers(${JSON.stringify(markers)})`,
    );
  }, [ready, markers, inject]);

  // 히트맵 점 — {lat,lng,value}. 동일좌표 군집 count 를 value 로 실어 밀도에 가중(10건>1건).
  const heatPoints = useMemo(
    () => groupedMarkers.map((m) => ({ lat: m.lat, lng: m.lng, value: m.count ?? 1 })),
    [groupedMarkers],
  );
  useEffect(() => {
    if (!ready) return;
    inject(
      `window.__mfzSetHeatPoints&&window.__mfzSetHeatPoints(${JSON.stringify(heatPoints)})`,
    );
  }, [ready, heatPoints, inject]);

  // 표시 방식(markers/heatmap/choropleth) 전환.
  useEffect(() => {
    if (!ready) return;
    inject(`window.__mfzSetMode&&window.__mfzSetMode(${JSON.stringify(displayMode)})`);
  }, [ready, displayMode, inject]);

  // 시/군/구 경계선 표시 토글.
  useEffect(() => {
    if (!ready) return;
    inject(
      `window.__mfzSetShowBoundary&&window.__mfzSetShowBoundary(${showBoundary ? 'true' : 'false'})`,
    );
  }, [ready, showBoundary, inject]);

  // 베이스 지도 종류(일반/위성/하이브리드) 전환.
  useEffect(() => {
    if (!ready) return;
    inject(
      `window.__mfzSetBaseMapType&&window.__mfzSetBaseMapType(${JSON.stringify(baseMapType)})`,
    );
  }, [ready, baseMapType, inject]);

  // 경계 지오메트리(~3MB) — needsBoundary 토글 시에만 1회 주입(stable ref). 마커 변경엔 안 보냄.
  useEffect(() => {
    if (!ready) return;
    inject(
      `window.__mfzSetBoundaryGeometry&&window.__mfzSetBoundaryGeometry(${boundaryRings ? JSON.stringify(boundaryRings) : 'null'})`,
    );
  }, [ready, boundaryRings, inject]);

  // 단계구분도 채색(code→opacity) — 마커 변경마다 갱신하되 페이로드가 작아 저렴.
  useEffect(() => {
    if (!ready) return;
    inject(
      `window.__mfzSetRegionFill&&window.__mfzSetRegionFill(${regionFill ? JSON.stringify(regionFill) : 'null'})`,
    );
  }, [ready, regionFill, inject]);

  // 현재 위치 오버레이.
  useEffect(() => {
    if (!ready) return;
    const payload = myLocation
      ? `{lat:${myLocation.lat},lng:${myLocation.lng}}`
      : 'null';
    inject(`window.__mfzSetMyLocation&&window.__mfzSetMyLocation(${payload})`);
  }, [ready, myLocation?.lat, myLocation?.lng, inject]);

  // center 변경 → in-place setCenter (pan/zoom 보존). fitToMarkers 모드는 fitBounds 가 잡으므로 생략.
  useEffect(() => {
    if (!ready || !center || fitToMarkers) return;
    inject(
      `window.__mfzMap&&window.__mfzMap.setCenter(new kakao.maps.LatLng(${center.lat},${center.lng}))`,
    );
  }, [ready, center?.lat, center?.lng, fitToMarkers, inject]);

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
            if (msg.type === 'ready') {
              setReady(true);
            } else if (msg.type === 'tilesloaded') {
              onTilesLoaded?.();
            } else if (
              msg.type === 'viewchanged' &&
              typeof msg.lat === 'number' &&
              typeof msg.lng === 'number'
            ) {
              onViewChange?.({ lat: msg.lat, lng: msg.lng, level: msg.level });
            } else if (msg.type === 'markerPress' && typeof msg.fieldId === 'string') {
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
                  {m.selected ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
  },
);

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
