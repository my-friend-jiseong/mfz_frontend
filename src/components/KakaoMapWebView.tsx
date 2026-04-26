import { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildKakaoMapHtml, type MapDisplayMode } from '@/assets/kakaoMapHtml';
import type { Field } from '@/types/entities';
import { colors } from '@/theme/colors';

export interface KakaoMapMarker {
  id: string;
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
  onMarkerPress?: (fieldId: string) => void;
}

const DEFAULT_CENTER = { lat: 35.17, lng: 129.07 }; // 부산 중심

export function KakaoMapWebView({
  markers,
  center,
  displayMode = 'markers',
  showBoundary = false,
  onMarkerPress,
}: Props) {
  const webRef = useRef<WebView>(null);

  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

  const html = useMemo(
    () =>
      buildKakaoMapHtml({
        kakaoJsKey,
        markers,
        center: center ?? DEFAULT_CENTER,
        displayMode,
        showBoundary,
      }),
    [kakaoJsKey, markers, center, displayMode, showBoundary],
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="compatibility"
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'markerPress' && typeof msg.fieldId === 'string') {
              onMarkerPress?.(msg.fieldId);
            }
          } catch {
            // ignore
          }
        }}
        style={styles.web}
      />
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
  container: { flex: 1, backgroundColor: colors.background },
  web: { flex: 1, backgroundColor: 'transparent' },
});
