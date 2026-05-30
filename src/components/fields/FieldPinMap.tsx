import { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/spacing';

interface Props {
  lat: number;
  lng: number;
  onDragEnd: (lat: number, lng: number) => void;
  height?: number;
}

// 새 현장 step 2 에서 핀 드래그로 좌표 미세 조정용 단일 마커 지도.
// 일반 MapDashboard 와 분리 — 필터/그룹/myLocation 등 무관, 단일 마커만 표시.
export function FieldPinMap({ lat, lng, onDragEnd, height = 220 }: Props) {
  const webRef = useRef<WebView>(null);
  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

  // 좌표가 바뀔 때마다 HTML 을 새로 만들지 않도록 — initial center 만 의미. drag end 후
  // RN 측은 onDragEnd 로 상태 갱신, WebView 안 마커는 자체 위치 유지.
  const html = useMemo(
    () => buildHtml(kakaoJsKey, lat, lng),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kakaoJsKey],
  );

  if (!kakaoJsKey) return null;

  return (
    <View style={[styles.container, { height }]}>
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
            if (msg.type === 'pinDragEnd' && typeof msg.lat === 'number' && typeof msg.lng === 'number') {
              onDragEnd(msg.lat, msg.lng);
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

function buildHtml(kakaoJsKey: string, lat: number, lng: number): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>html,body{margin:0;padding:0;height:100%;width:100%;}#map{height:100%;width:100%;}</style>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false"></script>
</head><body>
<div id="map"></div>
<script>
(function(){
  function postMsg(m){var s=JSON.stringify(m);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);}else if(window.parent&&window.parent!==window){window.parent.postMessage(s,'*');}}
  kakao.maps.load(function(){
    var map = new kakao.maps.Map(document.getElementById('map'), {
      center: new kakao.maps.LatLng(${lat}, ${lng}),
      level: 3,
    });
    var marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(${lat}, ${lng}),
      map: map,
      draggable: true,
    });
    kakao.maps.event.addListener(marker, 'dragend', function(){
      var p = marker.getPosition();
      postMsg({ type: 'pinDragEnd', lat: p.getLat(), lng: p.getLng() });
    });
    // 지도 탭으로도 핀을 이동 — 사용자 편의 (drag 미숙해도 한 번에 보정 가능).
    kakao.maps.event.addListener(map, 'click', function(mouseEvent){
      var p = mouseEvent.latLng;
      marker.setPosition(p);
      postMsg({ type: 'pinDragEnd', lat: p.getLat(), lng: p.getLng() });
    });
  });
})();
</script>
</body></html>`;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  web: { flex: 1, backgroundColor: 'transparent' },
});
