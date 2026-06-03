// Kakao Maps JS SDK를 WebView에 임베드할 HTML 문자열 생성
// KAKAO_JS_KEY 없으면 placeholder 렌더

export type MapDisplayMode = 'markers' | 'heatmap' | 'choropleth';

interface MapHtmlOptions {
  kakaoJsKey: string;
  // shape/badge: KWCAG 1.4.1 색각이상 대응 — 색 단독 표현 금지, 형상·라벨 동반.
  // count/groupIds: 호출 측에서 동일 좌표를 그루핑한 head 마커. count>1이면 카운트 뱃지 표시,
  //                 클릭 시 markerGroupPress 메시지로 groupIds 배열 전송.
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
  displayMode?: MapDisplayMode;
  showBoundary?: boolean;
  // 사용자 현재 위치 — 있으면 별도 파란 점 + pulse 링으로 표시. 클릭 비활성.
  myLocation?: { lat: number; lng: number } | null;
  // true 면 center/level 대신 모든 마커가 한 화면에 들어오도록 setBounds 로 자동 프레이밍.
  // 위치도(보고서 작성 미리보기 등)처럼 "현장 전체를 담는" 정적 뷰에 사용.
  fitToMarkers?: boolean;
  // false 면 드래그/줌 비활성 — BottomSheet 안 등 pan 충돌 회피용 정적 위치도(figure).
  interactive?: boolean;
  // 시/군/구 외곽 링 슬림 지오메트리 (sigungu.getBoundaryRings). 경계/단계구분도에 필요할 때만 주입.
  // 있으면 런타임 fetch/CDN 없이 이 좌표로 폴리곤을 그린다.
  boundaryRings?: { code: string; rings: number[][][] }[];
  // code → fillOpacity. 단계구분도 채색용. RN 측에서 집계·계산해 주입.
  regionFill?: Record<string, number>;
}

export function buildKakaoMapHtml({
  kakaoJsKey,
  markers,
  center,
  displayMode = 'markers',
  showBoundary = false,
  myLocation = null,
  fitToMarkers = false,
  interactive = true,
  boundaryRings,
  regionFill,
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

  const markersJson = JSON.stringify(markers);
  const modeLiteral = JSON.stringify(displayMode);
  const showBoundaryLiteral = showBoundary ? 'true' : 'false';
  const myLocationLiteral = myLocation ? JSON.stringify(myLocation) : 'null';
  const boundaryRingsLiteral = boundaryRings ? JSON.stringify(boundaryRings) : 'null';
  const regionFillLiteral = regionFill ? JSON.stringify(regionFill) : 'null';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>
  html,body{margin:0;padding:0;height:100%;width:100%;}
  #map{height:100%;width:100%;}
  #banner{position:absolute;top:12px;left:12px;right:12px;background:#d97706ee;color:#fff;padding:10px 14px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.4;z-index:10;display:none;}
  @keyframes mfzPulse { 0% { transform: scale(0.6); opacity: 0.7; } 100% { transform: scale(2.4); opacity: 0; } }
  .mfz-me-ring { position:absolute; top:50%; left:50%; width:22px; height:22px; margin:-11px 0 0 -11px; border-radius:50%; background:#2563eb; opacity:0.35; animation: mfzPulse 1.6s ease-out infinite; }
  .mfz-me-dot { position:absolute; top:50%; left:50%; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; background:#2563eb; border:3px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.35); }
</style>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false"></script>
</head><body>
<div id="map"></div>
<div id="banner"></div>
<script>
(function(){
  var MARKERS = ${markersJson};
  var CENTER = { lat: ${center.lat}, lng: ${center.lng} };
  var MODE = ${modeLiteral};
  var SHOW_BOUNDARY = ${showBoundaryLiteral};
  var MY_LOCATION = ${myLocationLiteral};
  var FIT_TO_MARKERS = ${fitToMarkers ? 'true' : 'false'};
  var INTERACTIVE = ${interactive ? 'true' : 'false'};
  // 슬림 외곽 링 + code별 fillOpacity — RN(sigungu.ts)에서 집계·계산해 주입. 런타임 fetch/CDN 없음.
  var BOUNDARY_RINGS = ${boundaryRingsLiteral};
  var REGION_FILL = ${regionFillLiteral};
  ${postMsgFn}

  function showBanner(text){
    var b = document.getElementById('banner');
    b.textContent = text;
    b.style.display = 'block';
  }

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

    function renderMarkers(){
      MARKERS.forEach(function(m){
        var pos = new kakao.maps.LatLng(m.lat, m.lng);
        var content = document.createElement('div');
        content.innerHTML = buildMarkerHtml(m);
        content.firstChild.addEventListener('click', function(){
          if ((m.count || 1) > 1) {
            postMsg({ type: 'markerGroupPress', groupIds: m.groupIds || [m.id] });
          } else {
            postMsg({ type: 'markerPress', fieldId: m.id });
          }
        });
        new kakao.maps.CustomOverlay({
          position: pos,
          content: content,
          map: map,
          // anchor 박스 = SVG 36×36. 중앙(0.5,0.5)이 좌표에 정확히 정렬되어 줌 무관 정확.
          xAnchor: 0.5,
          yAnchor: 0.5,
        });
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

    // kakao level↑ = 축소(픽셀당 미터↑). 화면상 블롭 크기를 줌 무관하게 일정히 유지하려
    // 미터 반경을 level 에 2배씩 비례. (웹: KakaoMapWebView.web.tsx radiusForLevel 과 동일 식)
    function radiusForLevel(level){
      var r = 500 * Math.pow(2, level - 6);
      return Math.max(50, Math.min(50000, r));
    }
    var heatCircles = [];
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
    }

    // 경계·단계구분도 — RN 에서 주입한 슬림 링(BOUNDARY_RINGS) + code별 fillOpacity(REGION_FILL)로
    // 폴리곤만 그린다. 좌표 변환·집계는 RN(sigungu.ts)에서 끝났으므로 여기선 네트워크/CDN 불필요.
    function renderPolygons(){
      var isChoropleth = MODE === 'choropleth';
      if (!SHOW_BOUNDARY && !isChoropleth) return;
      if (!BOUNDARY_RINGS) return;

      BOUNDARY_RINGS.forEach(function(feat){
        var fillOpacity = isChoropleth && REGION_FILL ? (REGION_FILL[feat.code] || 0) : 0;
        feat.rings.forEach(function(ring){
          var path = ring.map(function(c){ return new kakao.maps.LatLng(c[1], c[0]); });
          var p = new kakao.maps.Polygon({
            path: path,
            strokeWeight: SHOW_BOUNDARY ? 1.5 : 0.8,
            strokeColor: '#004c80',
            strokeOpacity: SHOW_BOUNDARY ? 0.6 : 0.3,
            strokeStyle: 'solid',
            fillColor: '#2563eb',
            fillOpacity: fillOpacity,
          });
          p.setMap(map);
        });
      });
    }

    // 현재 위치 마커 — RN 측 in-place 갱신을 위해 overlay ref 보존.
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
    window.__mfzSetMyLocation = applyMyLocation;

    if (MODE === 'heatmap') {
      renderHeatmap();
      // 줌 변경 시 블롭 반경을 화면상 일정하게 — 전국 뷰서 점, 거리 뷰서 거대해지던 문제 차단.
      kakao.maps.event.addListener(map, 'zoom_changed', function(){
        var radius = radiusForLevel(map.getLevel());
        for (var i = 0; i < heatCircles.length; i++) heatCircles[i].setRadius(radius);
      });
    } else {
      // markers · choropleth 모두 마커 표시
      renderMarkers();
    }
    fitBounds();

    applyMyLocation(MY_LOCATION);
    renderPolygons();

    postMsg({ type: 'ready' });
  });
})();
</script>
</body></html>`;
}
