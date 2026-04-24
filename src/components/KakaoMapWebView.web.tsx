import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Field } from '@/types/entities';
import type { MapDisplayMode } from '@/assets/kakaoMapHtml';
import {
  loadSigunguGeoJson,
  aggregateByRegion,
  opacityForCount,
} from '@/assets/boundaries/sigungu';
import { colors } from '@/theme/colors';
import { spacing, fontSize } from '@/theme/spacing';

export interface KakaoMapMarker {
  id: number;
  lat: number;
  lng: number;
  label: string;
  color: string;
}

interface Props {
  markers: KakaoMapMarker[];
  center?: { lat: number; lng: number };
  displayMode?: MapDisplayMode;
  showBoundary?: boolean;
  onMarkerPress?: (fieldId: number) => void;
}

const DEFAULT_CENTER = { lat: 35.17, lng: 129.07 };
const SDK_SCRIPT_ID = '__kakao_maps_sdk__';

type Overlay = { setMap: (m: unknown | null) => void };
type KakaoGlobal = {
  maps: {
    load: (cb: () => void) => void;
    LatLng: new (lat: number, lng: number) => unknown;
    Map: new (container: HTMLElement, options: { center: unknown; level: number }) => unknown;
    Marker: new (options: { position: unknown; map: unknown; title?: string }) => Overlay;
    Circle: new (options: {
      center: unknown;
      radius: number;
      strokeWeight?: number;
      fillColor?: string;
      fillOpacity?: number;
    }) => Overlay;
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
      addListener: (target: unknown, type: string, handler: () => void) => void;
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
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appkey)}&autoload=false`;
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
  onMarkerPress,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const overlaysRef = useRef<Overlay[]>([]);
  const boundaryOverlaysRef = useRef<Overlay[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

  // 지도 인스턴스 1회 생성
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
        const c = center ?? DEFAULT_CENTER;
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
    // 초기 center로만 생성. 이후 center 변경은 별도 useEffect에서 처리 가능 (현재는 불필요)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoJsKey]);

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

      // 단계구분도 모드일 때 현장 카운트 집계
      const counts = isChoropleth
        ? aggregateByRegion(
            markers.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })),
            fc,
          )
        : null;
      const maxCount = counts
        ? Math.max(0, ...Array.from(counts.values()))
        : 0;

      fc.features.forEach((featureItem) => {
        const geom = featureItem.geometry;
        const polygons =
          geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

        const regionCount = counts?.get(featureItem.properties.code) ?? 0;
        const choroplethOpacity = counts
          ? opacityForCount(regionCount, maxCount)
          : 0;

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
            fillColor: '#2563eb',
            fillOpacity: isChoropleth ? choroplethOpacity : 0,
          });
          poly.setMap(mapRef.current);
          boundaryOverlaysRef.current.push(poly);
        });
      });
    } catch (e) {
      console.error('경계/단계구분도 로드 실패', e);
    }
  }, [ready, showBoundary, displayMode, markers]);

  // 오버레이 갱신 (displayMode·markers에 반응)
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const k = getKakao();
    if (!k) return;
    // 기존 오버레이 모두 제거
    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];

    if (displayMode === 'heatmap') {
      // heatmap.js 없이 Circle로 밀도 근사 표현
      markers.forEach((m) => {
        const circle = new k.maps.Circle({
          center: new k.maps.LatLng(m.lat, m.lng),
          radius: 500,
          strokeWeight: 0,
          fillColor: '#dc2626',
          fillOpacity: 0.28,
        });
        circle.setMap(mapRef.current);
        overlaysRef.current.push(circle);
      });
    } else {
      // markers 또는 choropleth(데이터 없어서 마커 폴백)
      markers.forEach((m) => {
        const marker = new k.maps.Marker({
          position: new k.maps.LatLng(m.lat, m.lng),
          map: mapRef.current,
          title: m.label,
        });
        k.maps.event.addListener(marker, 'click', () => {
          onMarkerPress?.(m.id);
        });
        overlaysRef.current.push(marker);
      });
    }
  }, [markers, ready, onMarkerPress, displayMode]);

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
    backgroundColor: colors.danger + 'ee',
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
    backgroundColor: colors.warning + 'ee',
    padding: spacing.md,
    borderRadius: 8,
  },
  warnText: { color: '#fff', fontSize: fontSize.sm, fontWeight: '600' },
});
