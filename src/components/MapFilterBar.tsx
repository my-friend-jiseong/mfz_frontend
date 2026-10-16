import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapButton } from '@/components/ui/MapButton';
import { MapSettingsSheet, type MapSettingsProps } from '@/components/map/MapSettingsSheet';
import { space } from '@/theme/v2';
import type {
  DisplayMode,
  BaseMapType,
  AttachmentKind,
  VisibleAttachments,
  RangePreset,
} from '@/stores/mapSettingsStore';

// 표시 설정 타입의 진실 출처는 mapSettingsStore — 기존 import 경로 호환 위해 여기서 재노출.
export type { DisplayMode, BaseMapType, AttachmentKind, VisibleAttachments, RangePreset };

interface Props extends MapSettingsProps {
  /** 기본값에서 벗어난 설정이 있으면 버튼에 점. */
  changed: boolean;
}

/**
 * 지도 오른쪽 위 레이어 버튼 + 1-3 지도 설정 시트. 2차 지도 화면(1 지도)은 검색창 옆에 버튼을 직접 두고
 * MapSettingsSheet 를 쓴다 — 이 래퍼는 아직 2차로 옮기지 않은 지도 화면(현장·보고서)용 자리다.
 */
export function MapFilterBar({ changed, ...settings }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.anchor, { top: insets.top + space[8] }]} pointerEvents="box-none">
        <MapButton icon="layers" size={44} dot={changed} accessibilityLabel="지도 설정 열기" onPress={() => setOpen(true)} />
      </View>
      <MapSettingsSheet open={open} onClose={() => setOpen(false)} {...settings} />
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: space[16] },
});
