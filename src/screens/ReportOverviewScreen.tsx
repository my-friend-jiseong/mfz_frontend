import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KakaoMapWebView } from '@/components/KakaoMapWebView';
import { OVERVIEW_FIT_PADDING, OVERVIEW_MAP_HEIGHT, OVERVIEW_MAP_SIDE, useReportRows } from '@/components/reports/ReportParts';
import { BottomActionBar } from '@/components/ui/BottomActionBar';
import { Button2 } from '@/components/ui/Button2';
import { MapButton } from '@/components/ui/MapButton';
import { Text } from '@/components/ui/Text';
import { useReportStore } from '@/stores/reportStore';
import { safeBack } from '@/utils/backNavigation';
import { useOverviewMapView, useOverviewMapViewStore, type OverviewMapView } from '@/utils/overviewMapView';
import { c2, radius2, space } from '@/theme/v2';

/**
 * 9-7 위치도 구도(Figma 542:2706). 지도 전체 화면 + 가운데 틀 밖을 어둡게. 틀 안이 문서 첫 장 위치도가 된다.
 * 틀은 보고서 화면의 위치도 카드와 **같은 크기**(화면 폭 − 좌우 20, 높이 152)이고 지도 한가운데에 둔다 — 지도 중심·줌이 그대로
 * 카드의 중심·줌이 되고, 자동 맞춤도 카드와 같은 여백으로 맞춰 처음 줌이 카드와 같다. 문서 그림은 그 카드를 캡처한다.
 * (Figma 틀은 342×240 — 카드와 비율이 달라 '이 안이 문서에 들어가요'가 거짓이 되므로 카드 크기를 따랐다.)
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

  // 자동 맞춤(setBounds)이 줌을 바꾸며 보내는 첫 보고는 사용자의 구도가 아니다 — 손대기 전 첫 보고 하나만 버린다.
  const fitPending = useRef(false);
  const touched = useRef(false);
  useEffect(() => {
    fitPending.current = mountView === null;
    touched.current = false;
  }, [mapKey, mountView]);
  const onViewChange = (v: OverviewMapView) => {
    if (fitPending.current && !touched.current) {
      fitPending.current = false;
      return;
    }
    fitPending.current = false;
    setDraft(v);
  };

  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const frameW = Math.max(0, box.w - OVERVIEW_MAP_SIDE * 2);
  const frameH = OVERVIEW_MAP_HEIGHT;
  const frameTop = Math.round((box.h - frameH) / 2);
  const frameBottom = Math.max(0, box.h - frameTop - frameH);
  const [pt, pr, pb, pl] = OVERVIEW_FIT_PADDING;

  const auto = () => {
    setDraft(null);
    setMountView(null);
    setMapKey((k) => k + 1);
  };
  const save = async () => {
    await useOverviewMapViewStore.getState().save(reportId, draft);
    safeBack(router);
  };

  const loaded = !!report?.fieldReports;
  const empty = loaded && markers.length === 0;

  return (
    <View style={styles.root}>
      <View
        style={styles.flex}
        onLayout={onLayout}
        onTouchStart={() => {
          touched.current = true;
        }}
        onPointerDown={() => {
          touched.current = true;
        }}
      >
        {box.w > 0 && saved !== undefined && markers.length > 0 ? (
          <KakaoMapWebView
            key={mapKey}
            markers={markers}
            fitToMarkers={mountView === null}
            // 자동 맞춤은 틀 안에서 카드와 같은 여백으로.
            fitPadding={[frameTop + pt, OVERVIEW_MAP_SIDE + pr, frameBottom + pb, OVERVIEW_MAP_SIDE + pl]}
            center={mountView ? { lat: mountView.lat, lng: mountView.lng } : undefined}
            initialLevel={mountView?.level}
            holdCenterOnResize
            onViewChange={onViewChange}
          />
        ) : null}
        {frameW > 0 ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <View style={[styles.dim, { height: frameTop }]} />
            <View style={{ flexDirection: 'row', height: frameH }}>
              <View style={[styles.dim, { width: OVERVIEW_MAP_SIDE }]} />
              <View style={styles.frame} />
              <View style={[styles.dim, { width: OVERVIEW_MAP_SIDE }]} />
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
              {empty ? '보고서에 넣은 현장이 없어요' : `지도를 움직이고 확대해 현장 ${markers.length}곳을 맞춰 주세요`}
            </Text>
          </View>
        </View>
      </View>
      <BottomActionBar
        style={styles.footer}
        secondary={
          <Button2 variant="secondary" onPress={auto} disabled={empty} style={styles.autoBtn}>
            자동으로 맞추기
          </Button2>
        }
      >
        <Button2 onPress={() => void save()} disabled={empty} fullWidth>
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
  // 카드와 같은 모서리(16) — 틀 안이 카드 그대로 보이게.
  frame: { flex: 1, borderRadius: radius2.xl, borderWidth: 2, borderColor: c2.border.inverse },
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
