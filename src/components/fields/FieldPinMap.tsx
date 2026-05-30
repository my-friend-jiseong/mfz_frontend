import { useEffect, useMemo, useRef } from 'react';
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

  // initial 좌표는 ref 로 박아 html deps 에서 제외 — 후속 prop 변경은 injectJavaScript 로 in-place.
  // NaN 가드 — 호출 측 race 로 NaN 이 들어와도 WebView 내부에서 silent throw 되지 않도록.
  const safeLat = Number.isFinite(lat) ? lat : 0;
  const safeLng = Number.isFinite(lng) ? lng : 0;
  const initialLatRef = useRef(safeLat);
  const initialLngRef = useRef(safeLng);
  const html = useMemo(
    () => buildHtml(kakaoJsKey, initialLatRef.current, initialLngRef.current),
    [kakaoJsKey],
  );

  // 후속 lat/lng prop 변경 → marker + center in-place 이동.
  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const js = `if(window.__mfzPin){window.__mfzPin(${lat},${lng});}true;`;
    webRef.current?.injectJavaScript(js);
  }, [lat, lng]);

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
    // RN 측 injectJavaScript 가 prop 변경을 in-place 반영하기 위한 핸들.
    window.__mfzPin = function(la, ln){
      var p = new kakao.maps.LatLng(la, ln);
      marker.setPosition(p);
      map.setCenter(p);
    };
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
