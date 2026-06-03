import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Field, FieldStatus } from '@/types/entities';
import { FIELD_STATUS_LABEL } from '@/types/entities';
import type { MapDisplayMode } from '@/assets/kakaoMapHtml';
import { loadSigunguGeoJson, aggregateByRegion } from '@/assets/boundaries/sigungu';
import { fillOpacityForCount, CHOROPLETH_COLOR } from '@/theme/choroplethScale';
import { colors } from '@/theme/colors';
import { spacing, fontSize, radius } from '@/theme/spacing';
import { withAlpha } from '@/theme/withAlpha';
import { groupSameLocationMarkers } from '@/utils/groupSameLocationMarkers';

export interface KakaoMapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color: string;
  shape?: 'triangle' | 'circle' | 'check';
  badge?: string;
}

// KWCAG 1.4.1 — 색 + 형상 + 라벨 3중 인코딩.
const STATUS_TO_SHAPE: Record<FieldStatus, 'triangle' | 'circle' | 'check'> = {
  pending: 'triangle',
  in_progress: 'circle',
  done: 'check',
};
const STATUS_TO_BADGE: Record<FieldStatus, string> = FIELD_STATUS_LABEL;

function buildMarkerHtml(m: KakaoMapMarker, count = 1): string {
  const color = m.color || '#2563eb';
  const shape = m.shape || 'circle';
  const badge = m.badge || '';
  let svg: string;
  if (shape === 'triangle') {
    svg = `<svg width="36" height="36" viewBox="0 0 36 36"><polygon points="18,4 32,30 4,30" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  } else if (shape === 'check') {
    svg = `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="${color}" stroke="#fff" stroke-width="2"/><polyline points="11,18 16,23 25,13" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } else {
    svg = `<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="${color}" stroke="#fff" stroke-width="2"/></svg>`;
  }
  // 동일 좌표 그룹: 마커 우상단에 카운트 뱃지 — 좌표는 안 움직임, 다중임만 명시.
  const countBadge =
    count > 1
      ? `<div style="position:absolute;top:-4px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.25);box-sizing:border-box;">${count}</div>`
      : '';
  // 라벨은 absolute 로 SVG 아래에 띄움 — anchor 박스를 SVG(36×36) 로 한정해서
  // 줌 변화에 관계없이 SVG 중앙이 좌표에 정확히 정렬되도록.
  const labelHtml = `<div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;background:#fff;padding:2px 6px;border-radius:8px;font-size:11px;font-weight:600;color:#0f172a;border:1px solid ${color};white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.15);">${badge ? `<span style="color:${color};">${badge}</span> · ` : ''}${m.label || ''}</div>`;
  return `<div style="position:relative;width:36px;height:36px;cursor:pointer;">${svg}${countBadge}${labelHtml}</div>`;
}

interface Props {
  markers: KakaoMapMarker[];
  center?: { lat: number; lng: number };
  displayMode?: MapDisplayMode;
  showBoundary?: boolean;
  myLocation?: { lat: number; lng: number } | null;
  // true 면 모든 마커가 한 화면에 들어오도록 자동 프레이밍 (center 무시). 위치도 미리보기용.
  fitToMarkers?: boolean;
  // false 면 드래그/줌 비활성 — BottomSheet 안 등 pan 충돌 회피용 정적 위치도.
  interactive?: boolean;
  onMarkerPress?: (fieldId: string) => void;
}

const DEFAULT_CENTER = { lat: 35.17, lng: 129.07 };
const SDK_SCRIPT_ID = '__kakao_maps_sdk__';
const MY_LOC_PULSE_KEYFRAMES_ID = '__mfz_me_pulse__';

function ensureMyLocPulseStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(MY_LOC_PULSE_KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = MY_LOC_PULSE_KEYFRAMES_ID;
  style.textContent =
    '@keyframes mfzPulse { 0% { transform: scale(0.6); opacity: 0.7; } 100% { transform: scale(2.4); opacity: 0; } }';
  document.head.appendChild(style);
}

type Overlay = { setMap: (m: unknown | null) => void };
type Circle = Overlay & { setRadius: (radius: number) => void };
type LatLngBounds = { extend: (latlng: unknown) => void };
type KakaoMap = {
  setCenter: (latlng: unknown) => void;
  setLevel: (level: number) => void;
  getLevel: () => number;
  setBounds: (bounds: LatLngBounds, pt?: number, pr?: number, pb?: number, pl?: number) => void;
  setDraggable: (v: boolean) => void;
  setZoomable: (v: boolean) => void;
};

// kakao level↑ = 축소(픽셀당 미터↑). 화면상 블롭 크기를 줌 무관하게 일정히 유지하려
// 미터 반경을 level 에 2배씩 비례. (네이티브: kakaoMapHtml.ts radiusForLevel 과 동일 식)
function radiusForLevel(level: number): number {
  const r = 500 * Math.pow(2, level - 6);
  return Math.max(50, Math.min(50000, r));
}
type KakaoGlobal = {
  maps: {
    load: (cb: () => void) => void;
    LatLng: new (lat: number, lng: number) => unknown;
    LatLngBounds: new () => LatLngBounds;
    Map: new (container: HTMLElement, options: { center: unknown; level: number }) => KakaoMap;
    Marker: new (options: { position: unknown; map: unknown; title?: string }) => Overlay;
    Circle: new (options: {
      center: unknown;
      radius: number;
      strokeWeight?: number;
      fillColor?: string;
      fillOpacity?: number;
    }) => Circle;
    Polygon: new (options: {
      path: unknown[] | unknown[][];
      strokeWeight?: number;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeStyle?: string;
      fillColor?: string;
      fillOpacity?: number;
    }) => Overlay;
    event: {
      addListener: (target: unknown, type: string, handler: () => void) => unknown;
      removeListener: (listener: unknown) => void;
    };
  };
};

function getKakao(): KakaoGlobal | null {
  const w = window as unknown as { kakao?: KakaoGlobal };
  return w.kakao ?? null;
}

function loadKakaoSdk(appkey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('no window/document'));
      return;
    }
    const existing = getKakao();
    if (existing?.maps?.load) {
      existing.maps.load(() => resolve());
      return;
    }
    const prior = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (prior) {
      prior.addEventListener('load', () => {
        const k = getKakao();
        if (k?.maps?.load) k.maps.load(() => resolve());
        else reject(new Error('kakao not available after load'));
      });
      prior.addEventListener('error', () => reject(new Error('script error')));
      return;
    }
    const script = document.createElement('script');
    script.id = SDK_SCRIPT_ID;
    // libraries=services 필수 — 이 스크립트는 id 로 싱글톤이라, services 없이 먼저 로드되면
    // 같은 SDK 를 공유하는 장소검색(useKakaoPlaceSearch.web)에서 kakao.maps.services 가 undefined 가 됨.
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appkey)}&autoload=false&libraries=services`;
    script.async = true;
    script.onload = () => {
      const k = getKakao();
      if (k?.maps?.load) k.maps.load(() => resolve());
      else reject(new Error('kakao not available after load'));
    };
    script.onerror = () => reject(new Error('script error'));
    document.head.appendChild(script);
  });
}

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const overlaysRef = useRef<Overlay[]>([]);
  const heatCirclesRef = useRef<Circle[]>([]);
  const zoomListenerRef = useRef<unknown>(null);
  const myLocOverlayRef = useRef<Overlay | null>(null);
  const boundaryOverlaysRef = useRef<Overlay[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<KakaoMapMarker[] | null>(null);
  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

  // 동일 좌표 마커는 그룹으로 묶어 첫 마커만 표시 + "+N" 뱃지. 좌표 무손실.
  const markerGroups = useMemo(() => groupSameLocationMarkers(markers), [markers]);

  // 지도 인스턴스 1회 생성. 초기 center 는 props.center > myLocation > DEFAULT.
  useEffect(() => {
    if (!kakaoJsKey || !containerRef.current) return;
    let cancelled = false;
    loadKakaoSdk(kakaoJsKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const k = getKakao();
        if (!k) {
          setError('Kakao SDK 로드 실패');
          return;
        }
        const c = center ?? myLocation ?? DEFAULT_CENTER;
        mapRef.current = new k.maps.Map(containerRef.current, {
          center: new k.maps.LatLng(c.lat, c.lng),
          level: 8,
        });
        setReady(true);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
    // 초기 center로만 생성. 후속 변경은 아래 useEffect 가 in-place 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoJsKey]);

  // mount 후 center prop 변경 — map.setCenter 로 in-place 갱신 (init useEffect 가 무시하던 회로 차단).
  // fitToMarkers 모드에선 아래 setBounds 가 프레이밍을 잡으므로 center 추종 생략.
  useEffect(() => {
    if (!ready || !mapRef.current || !center || fitToMarkers) return;
    const k = getKakao();
    if (!k) return;
    mapRef.current.setCenter(new k.maps.LatLng(center.lat, center.lng));
  }, [ready, center?.lat, center?.lng, fitToMarkers]);

  // fitToMarkers — 모든 마커가 한 화면에 들어오도록 setBounds. 마커가 비동기로 도착(현장 좌표
  // 로드)하면 다시 맞춤. 1개면 setBounds 가 최대 줌으로 튀어 부적절 → 센터 + 적당한 level.
  useEffect(() => {
    if (!ready || !mapRef.current || !fitToMarkers || markers.length === 0) return;
    const k = getKakao();
    if (!k) return;
    if (markers.length === 1) {
      mapRef.current.setCenter(new k.maps.LatLng(markers[0].lat, markers[0].lng));
      mapRef.current.setLevel(5);
      return;
    }
    const bounds = new k.maps.LatLngBounds();
    markers.forEach((m) => bounds.extend(new k.maps.LatLng(m.lat, m.lng)));
    mapRef.current.setBounds(bounds, 40, 40, 56, 40);
  }, [ready, markers, fitToMarkers]);

  // 정적 위치도(figure) — 드래그/줌 차단. BottomSheet pan 충돌 회피 + 보고서 그림용.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setDraggable(interactive);
    mapRef.current.setZoomable(interactive);
  }, [ready, interactive]);

  // myLocation 오버레이 — ready 후 한 번 / myLocation 변경 시 재배치.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;
    myLocOverlayRef.current?.setMap(null);
    myLocOverlayRef.current = null;
    if (!myLocation) return;
    ensureMyLocPulseStyle();
    const content = document.createElement('div');
    content.style.cssText = 'position:relative;width:22px;height:22px;pointer-events:none;';
    content.innerHTML =
      '<div style="position:absolute;top:50%;left:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#2563eb;opacity:0.35;animation:mfzPulse 1.6s ease-out infinite;"></div>' +
      '<div style="position:absolute;top:50%;left:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>';
    const overlay = new (k.maps as unknown as {
      CustomOverlay: new (opts: {
        position: unknown;
        content: Element;
        map: unknown;
        xAnchor?: number;
        yAnchor?: number;
        zIndex?: number;
      }) => Overlay;
    }).CustomOverlay({
      position: new k.maps.LatLng(myLocation.lat, myLocation.lng),
      content,
      map: mapRef.current,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 5,
    });
    myLocOverlayRef.current = overlay;
  }, [ready, myLocation]);

  // 단계구분도 카운트 집계 — 폴리곤 effect 와 분리해, 경계만 토글(markers 불변)할 땐 재집계 생략.
  const regionCounts = useMemo(() => {
    if (displayMode !== 'choropleth') return null;
    return aggregateByRegion(
      markers.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })),
      loadSigunguGeoJson(),
    );
  }, [displayMode, markers]);

  // 행정구역 경계 + 단계구분도 렌더링 (공통 폴리곤)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;

    // 기존 경계 제거
    boundaryOverlaysRef.current.forEach((p) => p.setMap(null));
    boundaryOverlaysRef.current = [];

    const isChoropleth = displayMode === 'choropleth';
    if (!showBoundary && !isChoropleth) return;

    try {
      const fc = loadSigunguGeoJson();
      const counts = regionCounts; // 절대 건수 구간으로 채색(데이터 양 무관)

      fc.features.forEach((featureItem) => {
        const geom = featureItem.geometry;
        const polygons =
          geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

        const regionCount = counts?.get(featureItem.properties.code) ?? 0;
        const choroplethOpacity = counts ? fillOpacityForCount(regionCount) : 0;

        polygons.forEach((polygon) => {
          const outerRing = polygon[0];
          if (!outerRing) return;
          const path = outerRing.map(
            ([lng, lat]) => new k.maps.LatLng(lat, lng),
          );
          const poly = new k.maps.Polygon({
            path,
            strokeWeight: showBoundary ? 1.5 : 0.8,
            strokeColor: '#004c80',
            strokeOpacity: showBoundary ? 0.6 : 0.3,
            strokeStyle: 'solid',
            fillColor: CHOROPLETH_COLOR,
            fillOpacity: isChoropleth ? choroplethOpacity : 0,
          });
          poly.setMap(mapRef.current);
          boundaryOverlaysRef.current.push(poly);
        });
      });
    } catch (e) {
      console.error('경계/단계구분도 로드 실패', e);
    }
  }, [ready, showBoundary, displayMode, regionCounts]);

  // 오버레이 갱신 (displayMode·markers에 반응)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;
    // 기존 오버레이 + 직전 줌 리스너 제거
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    heatCirclesRef.current = [];
    if (zoomListenerRef.current) {
      k.maps.event.removeListener(zoomListenerRef.current);
      zoomListenerRef.current = null;
    }

    if (displayMode === 'heatmap') {
      // heatmap.js 없이 Circle로 밀도 근사 표현. 밀도는 raw markers 기준이 정확.
      const radius = radiusForLevel(mapRef.current.getLevel());
      markers.forEach((m) => {
        const circle = new k.maps.Circle({
          center: new k.maps.LatLng(m.lat, m.lng),
          radius,
          strokeWeight: 0,
          fillColor: '#dc2626',
          fillOpacity: 0.28,
        });
        circle.setMap(mapRef.current);
        overlaysRef.current.push(circle);
        heatCirclesRef.current.push(circle);
      });
      // 줌 변경 시 블롭 반경을 화면상 일정하게 — 전국 뷰서 점, 거리 뷰서 거대해지던 문제 차단.
      zoomListenerRef.current = k.maps.event.addListener(
        mapRef.current,
        'zoom_changed',
        () => {
          if (!mapRef.current) return;
          const r = radiusForLevel(mapRef.current.getLevel());
          heatCirclesRef.current.forEach((c) => c.setRadius(r));
        },
      );
    } else {
      // markers 또는 choropleth(데이터 없어서 마커 폴백) — KWCAG 1.4.1 색+형상+라벨.
      // 동일 좌표 그룹은 첫 마커만 그리고 카운트 뱃지로 표시 — 좌표 무손실.
      markerGroups.forEach((group) => {
        const head = group[0];
        const content = document.createElement('div');
        content.innerHTML = buildMarkerHtml(head, group.length);
        const child = content.firstChild as HTMLElement | null;
        if (child) {
          child.addEventListener('click', () => {
            if (group.length === 1) {
              onMarkerPress?.(head.id);
            } else {
              setActiveGroup(group);
            }
          });
        }
        const overlay = new (k.maps as unknown as {
          CustomOverlay: new (opts: {
            position: unknown;
            content: Element;
            map: unknown;
            xAnchor?: number;
            yAnchor?: number;
          }) => { setMap: (m: unknown) => void };
        }).CustomOverlay({
          position: new k.maps.LatLng(head.lat, head.lng),
          content,
          map: mapRef.current,
          // anchor 박스 = SVG 36×36. 중앙(0.5, 0.5)이 좌표에 정확히 정렬되어 줌 무관 정확.
          xAnchor: 0.5,
          yAnchor: 0.5,
        });
        overlaysRef.current.push(overlay);
      });
    }
  }, [markers, markerGroups, ready, onMarkerPress, displayMode]);

  if (!kakaoJsKey) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Kakao Maps 플레이스홀더</Text>
        <Text style={styles.placeholderDesc}>
          실제 지도 렌더링에는 Kakao JS Key가 필요합니다.
          {'\n'}
          .env.local에 EXPO_PUBLIC_KAKAO_JS_KEY를 설정하고 재시작하세요.
        </Text>
        <View style={styles.chipRow}>
          {markers.map((m) => (
            <Text
              key={m.id}
              onPress={() => onMarkerPress?.(m.id)}
              style={[styles.chip, { backgroundColor: m.color }]}
            >
              {m.label}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: 300,
          backgroundColor: colors.background,
        }}
      />
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>지도 로드 실패: {error}</Text>
          <Text style={styles.errorHint}>
            Kakao Developers → 플랫폼 Web에 현재 도메인(http://localhost:8081)을 등록했는지 확인하세요.
          </Text>
        </View>
      ) : null}
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
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
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
                      <Text style={styles.modalItemBadgeText}>{m.badge}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.modalItemLabel} numberOfLines={1}>
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

export function fieldsToMarkers(fields: Field[]): KakaoMapMarker[] {
  return fields.map((f) => ({
    id: f.id,
    lat: f.latitude,
    lng: f.longitude,
    label: f.address.split(' ').slice(-1)[0] || '현장',
    color: colors.fieldStatus[f.status],
    shape: STATUS_TO_SHAPE[f.status],
    badge: STATUS_TO_BADGE[f.status],
  }));
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, position: 'relative' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: '#f1f5f9',
  },
  placeholderTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  placeholderDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.xl,
    maxWidth: 360,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    color: '#fff',
    fontWeight: '700',
    fontSize: fontSize.xs,
    overflow: 'hidden',
  },
  errorBox: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: withAlpha(colors.danger, 0.93),
    padding: spacing.md,
    borderRadius: 8,
  },
  errorText: { color: '#fff', fontWeight: '700', fontSize: fontSize.sm },
  errorHint: { color: '#fff', fontSize: fontSize.xs, marginTop: 4 },
  warnBanner: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: withAlpha(colors.warning, 0.93),
    padding: spacing.md,
    borderRadius: 8,
  },
  warnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  modalTitle: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
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
  modalItemBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  modalItemLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.text,
  },
});
