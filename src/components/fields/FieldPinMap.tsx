import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { PinAddress } from '@/utils/addressSearch';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/spacing';

interface Props {
  lat: number;
  lng: number;
  // address 는 역지오코딩 성공 시에만 전달 (좌표는 즉시, 주소는 비동기 후속).
  onDragEnd: (lat: number, lng: number, address?: PinAddress) => void;
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
  // 사용자가 지도에서 방금 옮긴 좌표 — 이 값이 prop 으로 되돌아오면 재센터를 건너뛴다.
  // (재센터하면 핀이 항상 화면 중앙으로 튕겨 "안 움직이는" 것처럼 보이는 피드백 루프 차단)
  const lastEmittedRef = useRef<{ lat: number; lng: number } | null>(null);
  const html = useMemo(
    () => buildHtml(kakaoJsKey, initialLatRef.current, initialLngRef.current),
    [kakaoJsKey],
  );

  // 후속 lat/lng prop 변경 → marker + center in-place 이동.
  // 단, 사용자 본인 이동(lastEmitted)이면 재센터하지 않음 — 외부 변경(주소 재선택)만 재센터.
  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const le = lastEmittedRef.current;
    if (le && Math.abs(le.lat - lat) < 1e-9 && Math.abs(le.lng - lng) < 1e-9) return;
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
            const okCoord = typeof msg.lat === 'number' && typeof msg.lng === 'number';
            if (msg.type === 'pinDragEnd' && okCoord) {
              lastEmittedRef.current = { lat: msg.lat, lng: msg.lng };
              onDragEnd(msg.lat, msg.lng);
            } else if (msg.type === 'pinAddress' && okCoord && msg.address) {
              lastEmittedRef.current = { lat: msg.lat, lng: msg.lng };
              onDragEnd(msg.lat, msg.lng, msg.address as PinAddress);
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
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false&libraries=services"></script>
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
    var geocoder = new kakao.maps.services.Geocoder();
    // 좌표는 즉시 emit(마커는 이미 이동), 주소는 역지오코딩 콜백 후 후속 emit.
    function emitMove(la, ln){
      postMsg({ type: 'pinDragEnd', lat: la, lng: ln });
      geocoder.coord2Address(ln, la, function(result, status){
        if(status === kakao.maps.services.Status.OK && result && result[0]){
          var road = result[0].road_address;
          var jibun = result[0].address;
          var base = road || jibun || {};
          var roadAddress = road ? road.address_name : '';
          var jibunAddress = jibun ? jibun.address_name : '';
          var buildingName = (road && road.building_name) ? road.building_name : null;
          var display = buildingName ? (roadAddress + ' (' + buildingName + ')') : (roadAddress || jibunAddress);
          postMsg({ type: 'pinAddress', lat: la, lng: ln, address: {
            roadAddress: roadAddress, jibunAddress: jibunAddress, buildingName: buildingName,
            sido: base.region_1depth_name || '', sigungu: base.region_2depth_name || '', display: display
          }});
        }
      });
    }
    kakao.maps.event.addListener(marker, 'dragend', function(){
      var p = marker.getPosition();
      emitMove(p.getLat(), p.getLng());
    });
    // 지도 탭으로도 핀을 이동 — 사용자 편의 (drag 미숙해도 한 번에 보정 가능).
    kakao.maps.event.addListener(map, 'click', function(mouseEvent){
      var p = mouseEvent.latLng;
      marker.setPosition(p);
      emitMove(p.getLat(), p.getLng());
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
