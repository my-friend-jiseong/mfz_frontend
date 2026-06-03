// Kakao Maps JS SDK를 WebView에 임베드할 HTML 문자열 생성
// KAKAO_JS_KEY 없으면 placeholder 렌더
//
// 갱신 모델: HTML 은 마운트당 1회만 빌드(정적)하고, 마커·경계·단계구분도·현재위치는
// 모두 window.__mfzSet* 세터로 injectJavaScript in-place 주입한다.
//   - 마커 변경(필터)마다 문서를 통째로 리로드하던 회로 차단 → pan/zoom 보존, 재직렬화 최소화.
//   - 경계 지오메트리(시군구 외곽 링 ~3MB)는 ready 후 1회만 주입, 채색(fill)은 작은 맵만 갱신.

export type MapDisplayMode = 'markers' | 'heatmap' | 'choropleth';

interface MapHtmlOptions {
  kakaoJsKey: string;
  // placeholder(키 없음) 폴백에서 칩으로 표시할 마운트 시점 마커. 실지도 마커는 __mfzSetMarkers 로 주입.
  markers: {
    id: string;
    lat: number;
    lng: number;
    label: string;
    color: string;
    shape?: 'triangle' | 'circle' | 'check';
    badge?: string;
    count?: number;
    groupIds?: string[];
  }[];
  center: { lat: number; lng: number };
  // true 면 center/level 대신 모든 마커가 한 화면에 들어오도록 setBounds 로 자동 프레이밍.
  // 위치도(보고서 작성 미리보기 등)처럼 "현장 전체를 담는" 정적 뷰에 사용.
  fitToMarkers?: boolean;
  // false 면 드래그/줌 비활성 — BottomSheet 안 등 pan 충돌 회피용 정적 위치도(figure).
  interactive?: boolean;
}

export function buildKakaoMapHtml({
  kakaoJsKey,
  markers,
  center,
  fitToMarkers = false,
  interactive = true,
}: MapHtmlOptions): string {
  // RN WebView와 웹 iframe 양쪽에서 메시지 전송 가능한 브리지 스크립트
  const postMsgFn = `function postMsg(msg){var s=JSON.stringify(msg);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);}else if(window.parent&&window.parent!==window){window.parent.postMessage(s,'*');}}`;

  if (!kakaoJsKey) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>
  html,body{margin:0;padding:0;height:100%;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;}
  .ph{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f1f5f9;padding:24px;text-align:center;}
  .ph h3{margin:0 0 8px 0;color:#0f172a;font-size:16px;}
  .ph p{margin:0;color:#64748b;font-size:13px;line-height:1.5;}
  .ph .markers{margin-top:20px;display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:320px;}
  .ph .m{padding:6px 10px;border-radius:999px;font-size:12px;color:#fff;font-weight:600;cursor:pointer;}
</style></head><body>
<div class="ph">
  <h3>Kakao Maps 플레이스홀더</h3>
  <p>실제 지도 렌더링에는 Kakao JS Key가 필요합니다.<br>.env.local에 EXPO_PUBLIC_KAKAO_JS_KEY를 설정하세요.</p>
  <div class="markers" id="markers"></div>
</div>
<script>
${postMsgFn}
var MARKERS = ${JSON.stringify(markers)};
var container = document.getElementById('markers');
MARKERS.forEach(function(m){
  var el = document.createElement('div');
  el.className = 'm';
  el.style.background = m.color;
  el.textContent = m.label;
  el.onclick = function(){ postMsg({type:'markerPress', fieldId: m.id}); };
  container.appendChild(el);
});
</script>
</body></html>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>
  html,body{margin:0;padding:0;height:100%;width:100%;}
  #map{height:100%;width:100%;}
  @keyframes mfzPulse { 0% { transform: scale(0.6); opacity: 0.7; } 100% { transform: scale(2.4); opacity: 0; } }
  .mfz-me-ring { position:absolute; top:50%; left:50%; width:22px; height:22px; margin:-11px 0 0 -11px; border-radius:50%; background:#2563eb; opacity:0.35; animation: mfzPulse 1.6s ease-out infinite; }
  .mfz-me-dot { position:absolute; top:50%; left:50%; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; background:#2563eb; border:3px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.35); }
</style>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false"></script>
</head><body>
<div id="map"></div>
<script>
(function(){
  var CENTER = { lat: ${center.lat}, lng: ${center.lng} };
  var FIT_TO_MARKERS = ${fitToMarkers ? 'true' : 'false'};
  var INTERACTIVE = ${interactive ? 'true' : 'false'};
  ${postMsgFn}

  kakao.maps.load(function(){
    var container = document.getElementById('map');
    var map = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(CENTER.lat, CENTER.lng),
      level: 8,
    });
    // RN 측 injectJavaScript 에서 in-place 갱신을 위해 전역에 노출.
    window.__mfzMap = map;
    // 정적 위치도(figure) — 드래그/줌 차단. BottomSheet 등에서 pan 충돌 회피 + 보고서 그림용.
    if (!INTERACTIVE) { map.setDraggable(false); map.setZoomable(false); }

    // === 상태 (세터로 주입) ===
    var MARKERS = [];
    var MODE = 'markers';
    var SHOW_BOUNDARY = false;
    var REGION_FILL = null;

    // KWCAG 1.4.1 — status 별 색 + 형상 + 라벨 3중 인코딩 SVG.
    // count>1: 우상단 카운트 뱃지 + 라벨 absolute(좌표 정확도 무손실).
    function buildMarkerHtml(m){
      var color = m.color || '#2563eb';
      var shape = m.shape || 'circle';
      var badge = m.badge || '';
      var count = m.count || 1;
      var svg;
      if (shape === 'triangle') {
        svg = '<svg width="36" height="36" viewBox="0 0 36 36"><polygon points="18,4 32,30 4,30" fill="' + color + '" stroke="#fff" stroke-width="2"/></svg>';
      } else if (shape === 'check') {
        svg = '<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="' + color + '" stroke="#fff" stroke-width="2"/><polyline points="11,18 16,23 25,13" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      } else {
        svg = '<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="' + color + '" stroke="#fff" stroke-width="2"/></svg>';
      }
      var countBadge = count > 1
        ? '<div style="position:absolute;top:-4px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.25);box-sizing:border-box;">' + count + '</div>'
        : '';
      var labelHtml = '<div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;background:#fff;padding:2px 6px;border-radius:8px;font-size:11px;font-weight:600;color:#0f172a;border:1px solid ' + color + ';white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.15);">' + (badge ? '<span style="color:' + color + ';">' + badge + '</span> · ' : '') + (m.label||'') + '</div>';
      return '<div style="position:relative;width:36px;height:36px;cursor:pointer;">' + svg + countBadge + labelHtml + '</div>';
    }

    // === 마커 / 히트맵 레이어 ===
    var markerOverlays = [];
    var heatCircles = [];
    var heatZoomListener = null;

    function clearMarkerLayer(){
      for (var i = 0; i < markerOverlays.length; i++) markerOverlays[i].setMap(null);
      markerOverlays = [];
      for (var j = 0; j < heatCircles.length; j++) heatCircles[j].setMap(null);
      heatCircles = [];
      if (heatZoomListener) { kakao.maps.event.removeListener(heatZoomListener); heatZoomListener = null; }
    }

    function renderMarkers(){
      MARKERS.forEach(function(m){
        var content = document.createElement('div');
        content.innerHTML = buildMarkerHtml(m);
        content.firstChild.addEventListener('click', function(){
          if ((m.count || 1) > 1) {
            postMsg({ type: 'markerGroupPress', groupIds: m.groupIds || [m.id] });
          } else {
            postMsg({ type: 'markerPress', fieldId: m.id });
          }
        });
        var ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(m.lat, m.lng),
          content: content,
          map: map,
          // anchor 박스 = SVG 36×36. 중앙(0.5,0.5)이 좌표에 정확히 정렬되어 줌 무관 정확.
          xAnchor: 0.5,
          yAnchor: 0.5,
        });
        markerOverlays.push(ov);
      });
    }

    // kakao level↑ = 축소(픽셀당 미터↑). 화면상 블롭 크기를 줌 무관하게 일정히 유지하려
    // 미터 반경을 level 에 2배씩 비례. (웹: KakaoMapWebView.web.tsx radiusForLevel 과 동일 식)
    function radiusForLevel(level){
      var r = 500 * Math.pow(2, level - 6);
      return Math.max(50, Math.min(50000, r));
    }
    function renderHeatmap(){
      // heatmap.js 없이 Circle 오버레이로 밀도 근사. 줌 변화 시 setRadius 로 갱신.
      var radius = radiusForLevel(map.getLevel());
      MARKERS.forEach(function(m){
        var circle = new kakao.maps.Circle({
          center: new kakao.maps.LatLng(m.lat, m.lng),
          radius: radius,
          strokeWeight: 0,
          fillColor: '#dc2626',
          fillOpacity: 0.28,
        });
        circle.setMap(map);
        heatCircles.push(circle);
      });
      heatZoomListener = kakao.maps.event.addListener(map, 'zoom_changed', function(){
        var r = radiusForLevel(map.getLevel());
        for (var i = 0; i < heatCircles.length; i++) heatCircles[i].setRadius(r);
      });
    }

    // 모든 마커가 한 화면에 들어오도록 자동 프레이밍 — center/level 고정 대신.
    // 1개면 setBounds 가 최대 줌으로 튀어 부적절 → 그 점에 센터 + 적당한 level.
    function fitBounds(){
      if (!FIT_TO_MARKERS || MARKERS.length === 0) return;
      if (MARKERS.length === 1) {
        map.setCenter(new kakao.maps.LatLng(MARKERS[0].lat, MARKERS[0].lng));
        map.setLevel(5);
        return;
      }
      var bounds = new kakao.maps.LatLngBounds();
      MARKERS.forEach(function(m){ bounds.extend(new kakao.maps.LatLng(m.lat, m.lng)); });
      // padding(px): top,right,bottom,left — 라벨이 마커 아래 떠서 하단 여유 더 줌.
      map.setBounds(bounds, 40, 40, 56, 40);
    }

    function applyData(){
      clearMarkerLayer();
      if (MODE === 'heatmap') renderHeatmap();
      else renderMarkers(); // markers · choropleth 모두 마커 표시
      fitBounds();
    }

    // === 경계 / 단계구분도 폴리곤 ===
    // 지오메트리는 1회 주입해 code별 폴리곤 ref 를 보관하고, 스타일(스트로크·채색)만 싸게 갱신.
    var boundaryPolys = {}; // code -> [kakao.maps.Polygon]
    function clearBoundary(){
      for (var code in boundaryPolys) {
        var arr = boundaryPolys[code];
        for (var i = 0; i < arr.length; i++) arr[i].setMap(null);
      }
      boundaryPolys = {};
    }
    function applyBoundaryStyle(){
      var isChoropleth = MODE === 'choropleth';
      var visible = SHOW_BOUNDARY || isChoropleth;
      for (var code in boundaryPolys) {
        var fillOpacity = isChoropleth && REGION_FILL ? (REGION_FILL[code] || 0) : 0;
        var arr = boundaryPolys[code];
        for (var i = 0; i < arr.length; i++) {
          var p = arr[i];
          if (!visible) { p.setMap(null); continue; }
          p.setMap(map);
          p.setOptions({
            strokeWeight: SHOW_BOUNDARY ? 1.5 : 0.8,
            strokeOpacity: SHOW_BOUNDARY ? 0.6 : 0.3,
            fillOpacity: fillOpacity,
          });
        }
      }
    }

    // === 현재 위치 ===
    var myLocOverlay = null;
    function applyMyLocation(loc){
      if (myLocOverlay) { myLocOverlay.setMap(null); myLocOverlay = null; }
      if (!loc) return;
      var content = document.createElement('div');
      content.style.cssText = 'position:relative;width:22px;height:22px;pointer-events:none;';
      content.innerHTML = '<div class="mfz-me-ring"></div><div class="mfz-me-dot"></div>';
      myLocOverlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(loc.lat, loc.lng),
        content: content,
        map: map,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 5,
      });
    }

    // === 세터 (RN injectJavaScript 진입점) ===
    window.__mfzSetMarkers = function(markers){ MARKERS = markers || []; applyData(); };
    window.__mfzSetMode = function(mode){ MODE = mode; applyData(); applyBoundaryStyle(); };
    window.__mfzSetShowBoundary = function(sb){ SHOW_BOUNDARY = !!sb; applyBoundaryStyle(); };
    window.__mfzSetRegionFill = function(fill){ REGION_FILL = fill; applyBoundaryStyle(); };
    window.__mfzSetBoundaryGeometry = function(rings){
      clearBoundary();
      if (rings) {
        rings.forEach(function(feat){
          var arr = [];
          feat.rings.forEach(function(ring){
            var path = ring.map(function(c){ return new kakao.maps.LatLng(c[1], c[0]); });
            arr.push(new kakao.maps.Polygon({
              path: path,
              strokeColor: '#004c80',
              strokeStyle: 'solid',
              fillColor: '#2563eb',
              strokeWeight: 0.8,
              strokeOpacity: 0.3,
              fillOpacity: 0,
            }));
          });
          boundaryPolys[feat.code] = arr;
        });
      }
      applyBoundaryStyle();
    };
    window.__mfzSetMyLocation = applyMyLocation;

    // 초기엔 빈 지도 — 마커·경계·현재위치는 ready 직후 RN 이 주입.
    postMsg({ type: 'ready' });
  });
})();
</script>
</body></html>`;
}
