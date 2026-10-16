import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MapPinIcon } from '@/components/map/PinIcon';
import type { MapPinKind } from '@/assets/mapPins';
import { c2 } from '@/theme/v2';

// 5-5 현장 정보 수정의 위치 보정 지도: 핀은 가운데 고정, 지도를 끌어 맞춘다(Figma 556:2612).

// 핀 36×50(1.125배) — 끝이 지도 가운데보다 살짝(4) 떠 있고 아래에 그림자 타원(18×8).
const PIN_W = 36;
const PIN_H = (PIN_W * 44) / 32;
const TIP_RATIO = 40.8 / 44;
const LIFT = 4;

/** 지도 위 가운데 고정 핀. 손가락을 받지 않는다. */
export function CenterPinOverlay({ kind }: { kind: MapPinKind }) {
  return (
    <View pointerEvents="none" style={styles.layer}>
      <View style={styles.center}>
        <View style={styles.shadow} />
        <View style={styles.pin}>
          <MapPinIcon kind={kind} width={PIN_W} />
        </View>
      </View>
    </View>
  );
}

/** 원래 위치 — 흰 바탕 회색 점선 원 12(Figma '원래 위치'). 지도 HTML 안 CustomOverlay 내용. */
export const ORIGIN_DOT_HTML = `<div style="width:12px;height:12px;box-sizing:border-box;border-radius:6px;background:${c2.bg.canvas};border:2.5px dashed ${c2.border.mutedStrong};pointer-events:none;"></div>`;

const styles = StyleSheet.create({
  // 웹 카카오 지도는 내부 층에 z-index 를 줘서 형제인 이 층을 덮는다 — 위로 올린다.
  layer: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  // 크기 0 인 점을 지도 가운데에 두고 그 점을 기준으로 핀·그림자를 놓는다.
  center: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  shadow: {
    position: 'absolute',
    left: -9,
    top: -4,
    width: 18,
    height: 8,
    borderRadius: 4,
    backgroundColor: c2.bg.pinShadow,
  },
  pin: { position: 'absolute', left: -PIN_W / 2, top: -(PIN_H * TIP_RATIO) - LIFT },
});
