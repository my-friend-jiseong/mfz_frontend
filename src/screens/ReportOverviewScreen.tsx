import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KakaoMapWebView } from '@/components/KakaoMapWebView';
import { OVERVIEW_MAP_RATIO, useReportRows } from '@/components/reports/ReportParts';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { MapButton } from '@/components/ui/MapButton';
import { Text } from '@/components/ui/Text';
import { useReportStore } from '@/stores/reportStore';
import { safeBack } from '@/utils/backNavigation';
import { useOverviewMapView, useOverviewMapViewStore, type OverviewMapView } from '@/utils/overviewMapView';
import { c2, radius2, space } from '@/theme/v2';

// 틀 좌우 여백(Figma 9-7 '위치도 영역' x=24).
const SIDE = 24;
const SETTLE_MS = 1500;
// 핀은 좌표(끝) 위로 그려진다 — 자동 맞춤 때 위쪽에 핀 높이만큼 더 띄운다(Pin 32×44).
const PIN_H = 44;

/**
 * 9-7 위치도 구도(Figma 542:2706). 지도 전체 화면 + 가운데 틀 밖을 어둡게. 틀 안이 문서 첫 장 위치도가 된다.
 * 틀은 지도 한가운데에 두어 지도 중심 = 틀 중심이다 — 저장하는 값은 지도 중심·줌(OverviewMapView)이고,
 * 보고서 화면의 위치도 카드(350×152)가 같은 중심·줌으로 그려져 그 카드를 캡처한다. 그래서 틀도 카드와 같은 비율이다.
 * [자동으로 맞추기] = 현장 전체가 들어오게(저장하면 자동 맞춤으로 돌아간다). [이 구도로 저장] → 연 화면으로.
 */
export default function ReportOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const reportId = id ?? '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const report = useReportStore((s) => s.detailCache[reportId]);
  useEffect(() => {
    if (reportId && !useReportStore.getState().detailCache[reportId]?.fieldReports) void useReportStore.getState().loadDetail(reportId);
  }, [reportId]);
  const { markers } = useReportRows(report?.fieldReports);
  const saved = useOverviewMapView(reportId);

  // draft: 지금 보이는 구도(null = 자동 맞춤 그대로). mountView: 지도를 띄울 때 쓴 구도 — 바꾸면 key 로 다시 띄운다.
  const [draft, setDraft] = useState<OverviewMapView | null>(null);
  const [mountView, setMountView] = useState<OverviewMapView | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || saved === undefined) return;
    seeded.current = true;
    setDraft(saved);
    setMountView(saved);
    setMapKey((k) => k + 1);
  }, [saved]);

  // 지도를 띄운 직후 자동 맞춤(setBounds)이 줌을 바꾸며 보내는 보고는 사용자의 구도가 아니다 — 잠깐 무시한다.
  const mountedAt = useRef(0);
  useEffect(() => {
    mountedAt.current = Date.now();
  }, [mapKey]);
  const onViewChange = (v: OverviewMapView) => {
    if (Date.now() - mountedAt.current < SETTLE_MS) return;
    setDraft(v);
  };

  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const frameW = Math.max(0, box.w - SIDE * 2);
  const frameH = Math.round(frameW * OVERVIEW_MAP_RATIO);
  const frameTop = Math.round((box.h - frameH) / 2);

  const auto = () => {
    setDraft(null);
    setMountView(null);
    setMapKey((k) => k + 1);
  };
  const save = async () => {
    await useOverviewMapViewStore.getState().save(reportId, draft);
    safeBack(router);
  };

  return (
    <View style={styles.root}>
      <View style={styles.flex} onLayout={onLayout}>
        {box.w > 0 && saved !== undefined && markers.length > 0 ? (
          <KakaoMapWebView
            key={mapKey}
            markers={markers}
            fitToMarkers={mountView === null}
            // 자동 맞춤은 틀 안에 현장이 다 들어오게 — 틀 밖 여백만큼 덜어 낸다.
            fitPadding={[frameTop + space[12] + PIN_H, SIDE + space[12], frameTop + space[12], SIDE + space[12]]}
            center={mountView ? { lat: mountView.lat, lng: mountView.lng } : undefined}
            initialLevel={mountView?.level}
            onViewChange={onViewChange}
          />
        ) : null}
        {frameW > 0 ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[styles.dim, { height: frameTop }]} />
            <View style={{ flexDirection: 'row', height: frameH }}>
              <View style={[styles.dim, { width: SIDE }]} />
              <View style={styles.frame} />
              <View style={[styles.dim, { width: SIDE }]} />
            </View>
            <View style={[styles.dim, styles.flex, styles.below]}>
              <Text v2="caption.semibold" tone="inverse">
                이 안이 문서 첫 장에 들어가요
              </Text>
            </View>
          </View>
        ) : null}
        <View style={[styles.header, { top: insets.top + space[4] }]} pointerEvents="box-none">
          <MapButton icon="close" size={44} accessibilityLabel="닫기" onPress={() => safeBack(router)} />
          <View style={styles.hint}>
            <Text v2="caption.semibold" tone="inverse" numberOfLines={1}>
              {`지도를 움직이고 확대해 현장 ${markers.length}곳을 맞춰 주세요`}
            </Text>
          </View>
        </View>
      </View>
      <BottomActionBar
        style={styles.footer}
        secondary={
          <Button2 variant="secondary" onPress={auto} style={styles.autoBtn}>
            자동으로 맞추기
          </Button2>
        }
      >
        <Button2 onPress={() => void save()} fullWidth>
          이 구도로 저장
        </Button2>
      </BottomActionBar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c2.bg.canvas },
  flex: { flex: 1 },
  dim: { backgroundColor: c2.bg.overlay },
  frame: { flex: 1, borderRadius: radius2.sm, borderWidth: 2, borderColor: c2.border.inverse },
  below: { alignItems: 'center', paddingTop: space[6] },
  header: { position: 'absolute', left: space[8], right: space[8], flexDirection: 'row', alignItems: 'center', gap: space[8] },
  hint: {
    flexShrink: 1,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: space[14],
    borderRadius: radius2.full,
    backgroundColor: c2.bg.hint,
  },
  footer: { paddingTop: space[12], borderTopColor: c2.border.default },
  autoBtn: { width: 132 },
});
