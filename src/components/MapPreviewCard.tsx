import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { KakaoMapWebView, type KakaoMapMarker, type MapPath } from '@/components/KakaoMapWebView';
import type { AccuracyTone } from '@/assets/mapPins';
import { haversineKm } from '@/utils/routeOptimize';

// 내 위치가 핀에서 이 거리(m) 안이면 카드에 함께 보이도록 맞추고, 더 멀면 점을 그리지 않는다
// (멀리 있는 점까지 넣으면 핀이 작아지고, 안 넣으면 점이 카드 밖에 떠서 의미가 없다).
const MY_LOCATION_NEAR_M = 1000;
import { Icon } from '@/components/icons';
import { Text } from '@/components/ui/Text';
import { Touchable } from '@/components/ui/Touchable';
import { c2, elevation2, radius2, space } from '@/theme/v2';

interface Props {
  markers: KakaoMapMarker[];
  circle?: { lat: number; lng: number; radius: number; tone?: AccuracyTone } | null;
  paths?: MapPath[];
  startPoint?: { lat: number; lng: number } | null;
  myLocation?: { lat: number; lng: number } | null;
  /** 120 = 체크인(8), 132 = 현장 상세(5)·외근 상세(3) */
  height?: 120 | 132;
  /** 카드 아무 곳이나 [크게 보기]를 누르면 — 공통 전체 지도로 */
  onExpand: () => void;
  /** 스크린리더 이름. 예: '체크인한 현장 위치 크게 보기' */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * 정적 지도 카드(Figma 5 691:3426 · 8 694:4126). 카카오에 핀 여러 개·원을 그리는 정적 이미지 API 가 없어
 * 조작을 끈 지도(interactive=false, fitToMarkers)를 깔고 위에 투명 버튼을 덮는다(결정 기록).
 * 지도는 손가락을 받지 않으므로 스크롤 화면 안에 넣어도 스크롤을 뺏지 않는다.
 */
export function MapPreviewCard({
  markers,
  circle,
  paths,
  startPoint,
  myLocation,
  height = 132,
  onExpand,
  accessibilityLabel = '위치 지도 크게 보기',
  style,
}: Props) {
  // 선택 핀 크기는 카드 높이로 정해진다: 132(현장 상세) = lg 1.44배, 120(체크인) = sm 1.19배.
  const nearMe = useMemo(
    () =>
      myLocation && markers.some((m) => haversineKm(myLocation, { lat: m.lat, lng: m.lng }) * 1000 <= MY_LOCATION_NEAR_M)
        ? myLocation
        : null,
    [myLocation, markers],
  );
  const fitExtra = useMemo(() => (nearMe ? [nearMe] : undefined), [nearMe]);
  const sized = useMemo(
    () => markers.map((m) => (m.selected && !m.selectedSize ? { ...m, selectedSize: height === 132 ? ('lg' as const) : ('sm' as const) } : m)),
    [markers, height],
  );
  return (
    <View style={[styles.card, { height }, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <KakaoMapWebView
          markers={sized}
          circle={circle}
          paths={paths}
          startPoint={startPoint}
          myLocation={nearMe}
          fitExtra={fitExtra}
          interactive={false}
          fitToMarkers
          hideScale
        />
      </View>
      <Touchable
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        pressedOpacity={1}
        noAutoHitSlop
        style={StyleSheet.absoluteFill}
      >
        <View style={styles.expand} pointerEvents="none">
          <Icon name="expand" size={14} color={c2.text.primary} />
          <Text v2="small.bold">크게 보기</Text>
        </View>
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius2.lg,
    borderWidth: 1,
    borderColor: c2.border.default,
    backgroundColor: c2.bg.muted,
    overflow: 'hidden',
  },
  expand: {
    position: 'absolute',
    right: space[8],
    bottom: space[8],
    height: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    paddingLeft: space[8],
    paddingRight: space[10],
    borderRadius: radius2.lg,
    backgroundColor: c2.bg.canvas,
    ...elevation2.chip,
  },
});
