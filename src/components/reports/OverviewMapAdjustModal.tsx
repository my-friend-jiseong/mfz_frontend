import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeScreen } from '@/components/SafeScreen';
import { NavHeader } from '@/components/ui/NavHeader';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { KakaoMapWebView, type KakaoMapMarker } from '@/components/KakaoMapWebView';
import { colors } from '@/theme/colors';
import { spacing, radius } from '@/theme/spacing';
import type { OverviewMapView } from '@/utils/overviewMapView';

// 보고서 위치도 범위 조정 — 문서에 들어갈 위치도의 중심·줌을 사용자가 직접 맞춘다.
// 지도 크기를 상세 화면 위치도와 **같게** 둔다(width·height 를 그대로 받는다). 캡처는 상세 화면의
// 위치도를 찍으므로, 크기가 다르면 같은 center+level 이라도 담기는 범위가 달라진다.
export function OverviewMapAdjustModal({
  visible,
  markers,
  width,
  height,
  savedView,
  onClose,
  onSave,
}: {
  visible: boolean;
  markers: KakaoMapMarker[];
  width: number;
  height: number;
  // null = 자동 맞춤(현장 전체).
  savedView: OverviewMapView | null;
  onClose: () => void;
  // null 을 넘기면 자동 맞춤으로 되돌린다.
  onSave: (view: OverviewMapView | null) => void;
}) {
  // draft: 지금 모달에서 보이는 범위. null 이면 자동 맞춤 상태(사용자가 아직 안 건드림).
  const [draft, setDraft] = useState<OverviewMapView | null>(savedView);
  // 지도를 띄울 때의 범위 — draft 와 따로 둔다. 지도는 center/level 을 마운트 때만 읽고,
  // fitToMarkers 가 바뀌면 문서를 다시 읽어 들이므로 끄는 도중에 draft 로 묶으면 지도가 리셋된다.
  // 바꿀 땐 key 로 다시 띄운다.
  const [mountView, setMountView] = useState<OverviewMapView | null>(savedView);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setDraft(savedView);
    setMountView(savedView);
    setMapKey((k) => k + 1);
  }, [visible, savedView]);

  const resetToAuto = () => {
    setDraft(null);
    setMountView(null);
    setMapKey((k) => k + 1);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeScreen edges={['top', 'bottom']}>
        <NavHeader title="위치도 범위 조정" onBack={onClose} />
        <View style={styles.body}>
          <Text variant="bodySm" color="textMuted">
            지도를 끌고 확대·축소해서 문서에 들어갈 범위를 맞추세요. 보이는 그대로 Word·PDF 에 들어갑니다.
          </Text>
          <View style={[styles.map, { width, height }]}>
            {width > 0 ? (
              <KakaoMapWebView
                key={mapKey}
                markers={markers}
                fitToMarkers={mountView === null}
                center={mountView ? { lat: mountView.lat, lng: mountView.lng } : undefined}
                initialLevel={mountView?.level}
                onViewChange={setDraft}
              />
            ) : null}
          </View>
          <Text variant="caption" color="textMuted">
            {draft === null ? '지금은 현장 전체가 들어오도록 자동으로 맞춘 범위입니다.' : '직접 맞춘 범위입니다.'}
          </Text>
          <Button onPress={resetToAuto} variant="ghost" size="sm" leftIcon="scan-outline" disabled={draft === null}>
            현장 전체로 자동 맞춤
          </Button>
        </View>
        <View style={styles.actions}>
          <View style={styles.action}>
            <Button onPress={onClose} variant="secondary" size="lg" fullWidth>
              취소
            </Button>
          </View>
          <View style={styles.action}>
            <Button onPress={() => onSave(draft)} size="lg" fullWidth>
              이 범위로 저장
            </Button>
          </View>
        </View>
      </SafeScreen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // 좌우 여백은 상세 화면 시트(spacing.lg)와 같다 — 지도 폭을 맞추기 위해서다.
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  map: {
    alignSelf: 'center',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  action: { flex: 1 },
});
