import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KakaoMapWebView, type KakaoMapMarker } from '@/components/KakaoMapWebView';
import { MapButton } from '@/components/ui/MapButton';
import { Text } from '@/components/ui/Text';
import { getFullMapSpec, type FullMapLegendRow } from '@/components/shell/fullMap';
import { useFieldStore } from '@/stores/fieldStore';
import { STATUS_PIN_COLOR } from '@/components/shell/pinColors';
import { findNearbyFields } from '@/utils/nearestField';
import { fieldActionStatus } from '@/utils/fieldStatus';
import { safeBack } from '@/utils/backNavigation';
import { c2, elevation2, radius2, space } from '@/theme/v2';

// '주변 현장'으로 더해 보일 거리(m). Figma 5-10·8-12 는 250m 축척 화면 안의 이웃 핀이다.
const NEARBY_RADIUS_M = 500;
// GPS 오차 원(8-12)이 화면에서 보일 지름(pt). Figma 703:3411 은 390 폭에 166.
const ACCURACY_DIAMETER_PT = 166;
// 카카오 지도 level 의 해상도: level 3 = 1m/px, 한 단계마다 2배(level 1 = 0.25m/px).
const levelForMetersPerPx = (mpp: number) => Math.min(14, Math.max(1, Math.round(Math.log2(mpp) + 3)));

// 경로 순서 카드(3-8) 모서리. Figma 프레임에 변수 없이 18 로 박혀 있다.
const LEGEND_RADIUS = 18;

/**
 * 공통 전체 지도(3-8 경로 지도 · 3-9 / 5-10 / 8-9~8-12 위치 지도). X 로 닫는 모달이라 루트 (modals) 스택에 있다.
 * 인자는 openFullMap(spec) 이 메모리에 넣고 id 만 넘긴다(fullMap.ts).
 */
export default function FullMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const spec = getFullMapSpec(id);
  const fields = useFieldStore((s) => s.fields);
  // 경로 순서 카드(3-8)가 지도 아래를 덮으므로 핀 맞춤 여백을 카드 높이만큼 준다.
  const [legendH, setLegendH] = useState(0);

  const markers = useMemo<KakaoMapMarker[]>(() => {
    if (!spec) return [];
    const own: KakaoMapMarker[] = spec.pins.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      label: p.label ?? '',
      color: STATUS_PIN_COLOR[p.kind],
      pin: p.kind,
      order: p.order,
      selected: p.selected,
      selectedSize: p.selected ? 'sm' : undefined,
    }));
    if (!spec.nearbyFields) return own;
    const taken = new Set(spec.pins.map((p) => p.id));
    const near = new Map<string, KakaoMapMarker>();
    for (const p of spec.pins) {
      for (const n of findNearbyFields({ lat: p.lat, lng: p.lng }, fields, NEARBY_RADIUS_M)) {
        const f = n.field;
        if (taken.has(f.id) || near.has(f.id)) continue;
        near.set(f.id, {
          id: f.id,
          lat: f.latitude,
          lng: f.longitude,
          label: f.name?.trim() || f.address,
          color: STATUS_PIN_COLOR[fieldActionStatus(f)],
          pin: fieldActionStatus(f),
        });
      }
    }
    // 주변 핀을 먼저 그려 주인공 핀이 위에 오게 한다.
    return [...near.values(), ...own];
  }, [spec, fields]);

  // 오차 원이 있으면 핀 맞춤 대신 원이 Figma 크기로 보이게 원 중심·축척으로 연다 — 핀 맞춤(핀 1개 = level 5)이면
  // 반경 48m 원이 핀 밑에 묻힌다.
  const circle = spec?.accuracyCircle ?? null;
  const circleView = useMemo(
    () =>
      circle
        ? {
            center: { lat: circle.lat, lng: circle.lng },
            level: levelForMetersPerPx((circle.radius * 2) / ACCURACY_DIAMETER_PT),
          }
        : null,
    [circle],
  );

  return (
    <View style={styles.root}>
      <KakaoMapWebView
        center={circleView?.center}
        initialLevel={circleView?.level}
        markers={markers}
        circle={circle}
        paths={spec?.paths}
        startPoint={spec?.startPoint ?? null}
        myLocation={spec?.myLocation ?? null}
        fitToMarkers={!circleView}
        fitPadding={
          legendH > 0
            ? [insets.top + 64, 40, legendH + Math.max(insets.bottom, space[20]) + space[12] + space[24], 40]
            : undefined
        }
      />
      <View pointerEvents="box-none" style={[styles.header, { paddingTop: insets.top + space[4] }]}>
        <MapButton icon="close" size={44} accessibilityLabel="닫기" onPress={() => safeBack(router)} />
        {spec?.title ? (
          <View style={styles.titlePill}>
            <Text v2="bodyS.bold" numberOfLines={1}>
              {spec.title}
            </Text>
          </View>
        ) : null}
      </View>
      {spec?.legend?.length ? (
        <View
          style={[styles.legend, { bottom: Math.max(insets.bottom, space[20]) + space[12] }]}
          onLayout={(e) => setLegendH(Math.round(e.nativeEvent.layout.height))}
        >
          {spec.legend.map((row) => (
            <LegendRow key={row.key} row={row} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function LegendRow({ row }: { row: FullMapLegendRow }) {
  const tone = row.trailingTone ?? 'tertiary';
  return (
    <View style={[styles.row, row.dim && styles.dim]}>
      <View style={styles.markerSlot}>
        {row.marker === 'start' ? (
          <View style={styles.startDot} />
        ) : (
          <View style={[styles.orderDot, { backgroundColor: STATUS_PIN_COLOR[row.marker.kind] }]}>
            <Text v2="caption.extrabold" tone="inverse">
              {row.marker.order}
            </Text>
          </View>
        )}
      </View>
      <Text v2="bodyM.semibold" numberOfLines={1} style={styles.rowLabel}>
        {row.label}
      </Text>
      {row.trailing ? (
        <Text v2={row.marker === 'start' ? 'caption.semibold' : 'caption.bold'} tone={tone}>
          {row.trailing}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.muted },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[8],
    paddingLeft: space[8],
    paddingRight: space[16],
  },
  titlePill: {
    flexShrink: 1,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: space[14],
    borderRadius: radius2.full,
    backgroundColor: c2.bg.canvas,
    ...elevation2.control,
  },
  legend: {
    position: 'absolute',
    left: space[12],
    right: space[12],
    paddingHorizontal: space[16],
    paddingVertical: space[8],
    borderRadius: LEGEND_RADIUS,
    backgroundColor: c2.bg.canvas,
    ...elevation2.control,
  },
  row: { height: 44, flexDirection: 'row', alignItems: 'center', gap: space[12] },
  dim: { opacity: 0.6 },
  markerSlot: { width: 24, alignItems: 'center' },
  startDot: {
    width: 14,
    height: 14,
    borderRadius: radius2.full,
    borderWidth: 3,
    borderColor: c2.bg.ink,
    backgroundColor: c2.bg.canvas,
  },
  orderDot: {
    width: 24,
    height: 24,
    borderRadius: radius2.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1 },
});
