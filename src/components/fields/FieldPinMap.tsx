import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { PinAddress } from '@/utils/addressSearch';
import { KAKAO_WEBVIEW_BASE_URL } from '@/utils/kakaoMap';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/spacing';

interface Props {
  lat: number;
  lng: number;
  // address 는 역지오코딩 성공 시에만 전달 (좌표는 즉시, 주소는 비동기 후속).
  onDragEnd: (lat: number, lng: number, address?: PinAddress) => void;
  // 마운트 직후 초기 좌표를 역지오코딩해 pinAddress 를 1회 emit — 현 위치 시작 플로우용.
  // 마운트 시점 값만 사용 (후속 prop 변경 무시).
  resolveInitialAddress?: boolean;
  height?: number;
  // 지도에 손이 닿아 있는 동안 true. 부모 ScrollView 의 scrollEnabled 를 끄는 데 쓴다.
  //
  // 안드로이드에서 ScrollView 안 WebView 지도를 끌면 부모가 세로 드래그를 먼저 가로채
  // 지도가 pan 을 아예 못 받는다. RN 쪽 responder 훅(onStartShouldSetResponderCapture)은
  // WebView 자식이 있으면 신뢰도가 낮아(캡처하면 지도가 터치를 못 받고, 안 하면 release 가
  // 안 온다), 터치가 실제로 떨어지는 WebView 내부에서 신호를 올려보낸다.
  // 웹은 카카오 SDK 가 컨테이너에 touch-action:none 을 걸어 경합이 없으므로 호출하지 않는다.
  onInteractionChange?: (active: boolean) => void;
}

// 마운트 후 임의 시점에 핀 이동 + 역지오코딩을 트리거하는 명령형 핸들
// — "현 위치에서 시작" 재시도처럼 지도가 이미 떠 있는 상태에서 주소를 다시 받아올 때.
// FieldPinMap.web.tsx 와 동일 shape 유지.
export interface FieldPinMapHandle {
  resolveAddress: (lat: number, lng: number) => void;
}

// 현장 등록/수정에서 핀 드래그로 좌표 미세 조정용 단일 마커 지도.
// 일반 MapDashboard 와 분리 — 필터/그룹/myLocation 등 무관, 단일 마커만 표시.
export const FieldPinMap = forwardRef<FieldPinMapHandle, Props>(function FieldPinMap(
  { lat, lng, onDragEnd, resolveInitialAddress = false, height = 220, onInteractionChange },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

  // initial 좌표는 ref 로 박아 html deps 에서 제외 — 후속 prop 변경은 injectJavaScript 로 in-place.
  // NaN 가드 — 호출 측 race 로 NaN 이 들어와도 WebView 내부에서 silent throw 되지 않도록.
  const safeLat = Number.isFinite(lat) ? lat : 0;
  const safeLng = Number.isFinite(lng) ? lng : 0;
  const initialLatRef = useRef(safeLat);
  const initialLngRef = useRef(safeLng);
  const resolveInitialRef = useRef(resolveInitialAddress);
  // 사용자가 지도에서 방금 옮긴 좌표 — 이 값이 prop 으로 되돌아오면 재센터를 건너뛴다.
  // (재센터하면 핀이 항상 화면 중앙으로 튕겨 "안 움직이는" 것처럼 보이는 피드백 루프 차단)
  const lastEmittedRef = useRef<{ lat: number; lng: number } | null>(null);
  const html = useMemo(
    () =>
      buildHtml(
        kakaoJsKey,
        initialLatRef.current,
        initialLngRef.current,
        resolveInitialRef.current,
      ),
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

  // 안전장치 — touchend/touchcancel 이 유실되거나 WebView 가 리로드되면 active 가 true 로
  // 굳어 화면이 영영 스크롤 불가가 된다(원래 버그보다 나쁘다). 마지막 touchstart 로부터
  // 이 시간 안에 해제 신호가 없으면 스스로 푼다. 손가락을 오래 얹고 지도를 끄는 경우가 있어
  // 짧게 잡지 않는다.
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setInteracting = (active: boolean) => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    onInteractionChange?.(active);
    if (active) {
      releaseTimerRef.current = setTimeout(() => {
        releaseTimerRef.current = null;
        onInteractionChange?.(false);
      }, 3000);
    }
  };
  // 언마운트 시 반드시 풀어준다 — 지도가 사라진 뒤에도 스크롤이 잠겨 있으면 복구 수단이 없다.
  useEffect(
    () => () => {
      if (releaseTimerRef.current) clearTimeout(releaseTimerRef.current);
      onInteractionChange?.(false);
    },
    // 마운트/언마운트 1회 — onInteractionChange 는 호출부에서 setState 라 안정적.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useImperativeHandle(ref, () => ({
    resolveAddress: (la: number, ln: number) => {
      if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
      // SDK 로드 전이면 pending 에 적재 — __mfzResolve 정의 직후 flush (silent drop 방지).
      webRef.current?.injectJavaScript(
        `if(window.__mfzResolve){window.__mfzResolve(${la},${ln});}else{window.__mfzPendingResolve=[${la},${ln}];}true;`,
      );
    },
  }));

  if (!kakaoJsKey) return null;

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html, baseUrl: KAKAO_WEBVIEW_BASE_URL }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="compatibility"
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            const okCoord = typeof msg.lat === 'number' && typeof msg.lng === 'number';
            if (msg.type === 'mapTouch') {
              setInteracting(!!msg.active);
              return;
            }
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
});

function buildHtml(
  kakaoJsKey: string,
  lat: number,
  lng: number,
  resolveInitial: boolean,
): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>html,body{margin:0;padding:0;height:100%;width:100%;}#map{height:100%;width:100%;}</style>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false&libraries=services"></script>
</head><body>
<div id="map"></div>
<script>
(function(){
  function postMsg(m){var s=JSON.stringify(m);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);}else if(window.parent&&window.parent!==window){window.parent.postMessage(s,'*');}}
  // 부모 ScrollView 가 세로 드래그를 가로채는 것을 막기 위한 신호. 지도 동작 자체는 건드리지
  // 않도록 passive 리스너로만 붙인다. SDK 로드 실패해도 스크롤 잠금이 남지 않게 load 밖에 둔다.
  document.addEventListener('touchstart', function(){ postMsg({ type:'mapTouch', active:true }); }, {passive:true});
  document.addEventListener('touchend', function(){ postMsg({ type:'mapTouch', active:false }); }, {passive:true});
  document.addEventListener('touchcancel', function(){ postMsg({ type:'mapTouch', active:false }); }, {passive:true});
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
    // 주소만 역지오코딩 후 emit — 초기 1회(resolveInitial)와 이동 후속 공용.
    function emitAddress(la, ln){
      geocoder.coord2Address(ln, la, function(result, status){
        // stale 가드 — 응답 대기 중 핀이 이동했으면 폐기 (늦게 온 응답이 새 좌표를 되돌리는 race 차단).
        var cur = marker.getPosition();
        if(Math.abs(cur.getLat()-la) > 1e-9 || Math.abs(cur.getLng()-ln) > 1e-9) return;
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
    // 좌표는 즉시 emit(마커는 이미 이동), 주소는 역지오코딩 콜백 후 후속 emit.
    function emitMove(la, ln){
      postMsg({ type: 'pinDragEnd', lat: la, lng: ln });
      emitAddress(la, ln);
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
    // 명령형 핸들 — 핀 이동 + 역지오코딩 ("현 위치로 이동" 재시도용).
    window.__mfzResolve = function(la, ln){
      window.__mfzPin(la, ln);
      emitAddress(la, ln);
    };
    // SDK 로드 전에 RN 측이 적재해 둔 resolve 요청 flush.
    if(window.__mfzPendingResolve){
      var pr = window.__mfzPendingResolve;
      window.__mfzPendingResolve = null;
      window.__mfzResolve(pr[0], pr[1]);
    }
    // 현 위치 시작 플로우 — 초기 좌표의 주소를 1회 역지오코딩해 채운다.
    ${resolveInitial ? `emitAddress(${lat}, ${lng});` : ''}
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
