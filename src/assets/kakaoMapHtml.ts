// Kakao Maps JS SDK를 WebView에 임베드할 HTML 문자열 생성
// KAKAO_JS_KEY 없으면 placeholder 렌더
//
// 갱신 모델: HTML 은 마운트당 1회만 빌드(정적)하고, 마커·경계·단계구분도·현재위치는
// 모두 window.__mfzSet* 세터로 injectJavaScript in-place 주입한다.
//   - 마커 변경(필터)마다 문서를 통째로 리로드하던 회로 차단 → pan/zoom 보존, 재직렬화 최소화.
//   - 경계 지오메트리(시군구 외곽 링 ~3MB)는 ready 후 1회만 주입, 채색(fill)은 작은 맵만 갱신.

import {
  HEAT_GRADIENT,
  HEAT_CONFIG,
  HEAT_MAX,
  HEAT_RADIUS_MIN,
  heatRadiusForLevel,
} from '@/theme/heatScale';

// 카카오 레벨(1~14)별 히트 반경 — heatScale.heatRadiusForLevel 을 빌드 시점에 평가해
// 표로 주입한다. 공식을 템플릿 JS 로 복제하지 않으므로 단일 소스(heatScale)만 고치면 됨.
const HEAT_RADIUS_BY_LEVEL_JSON = JSON.stringify(
  Object.fromEntries(
    Array.from({ length: 14 }, (_, i) => [i + 1, heatRadiusForLevel(i + 1)]),
  ),
);
import { HEATMAP_JS_SOURCE } from '@/assets/heatmapLib';

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
  #mapwrap{position:relative;height:100%;width:100%;}
  #map{position:absolute;inset:0;}
  /* KDE 히트맵 캔버스 — 지도 위 투명 오버레이. 항상 표시(데이터 없으면 투명)하고
     heatmap 모드가 아닐 땐 빈 데이터로 비운다. display:none 으로 숨기면 생성 시
     getComputedStyle 폭이 auto→NaN 이 되어 캔버스가 깨지므로 토글하지 않는다.
     h337 은 컨테이너의 position 을 relative 로 강제 덮어쓰므로, h337 에는 #heat 가 아니라
     안쪽 #heatInner(명시적 100%×100%)를 넘긴다 — 안 그러면 컨테이너가 height 0 으로 붕괴해
     clientHeight 기반 리사이즈·뷰포트 필터가 전부 0 을 읽는다. */
  #heat{position:absolute;inset:0;pointer-events:none;z-index:5;}
  #heatInner{width:100%;height:100%;}
  @keyframes mfzPulse { 0% { transform: scale(0.6); opacity: 0.7; } 100% { transform: scale(2.4); opacity: 0; } }
  .mfz-me-ring { position:absolute; top:50%; left:50%; width:22px; height:22px; margin:-11px 0 0 -11px; border-radius:50%; background:#2563eb; opacity:0.35; animation: mfzPulse 1.6s ease-out infinite; }
  .mfz-me-dot { position:absolute; top:50%; left:50%; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; background:#2563eb; border:3px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.35); }
</style>
<script>${HEATMAP_JS_SOURCE}</script>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false"></script>
</head><body>
<div id="mapwrap"><div id="map"></div><div id="heat"><div id="heatInner"></div></div></div>
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
    var HEAT_POINTS = [];
    var MODE = 'markers';
    var SHOW_BOUNDARY = false;
    var REGION_FILL = null;

    // === KDE 히트맵 (heatmap.js / h337) ===
    // 카카오엔 히트맵 레이어가 없어 투명 캔버스에 직접 그린다. 점은 위경도로 보관하고
    // pan/zoom 마다 containerPointFromCoords 로 화면 px 로 변환해 다시 그린다(어긋남 방지).
    var heatEl = document.getElementById('heatInner'); // h337 소유 — #heat(wrapper)는 건드리지 않음
    var heat = h337.create({
      container: heatEl,
      radius: ${HEAT_CONFIG.radius},
      maxOpacity: ${HEAT_CONFIG.maxOpacity},
      minOpacity: ${HEAT_CONFIG.minOpacity},
      blur: ${HEAT_CONFIG.blur},
      gradient: ${JSON.stringify(HEAT_GRADIENT)},
    });
    var heatPending = false;
    var heatZooming = false; // 줌 애니메이션 진행 중 플래그 — 전환 프레임마다 재계산하지 않음
    // 극단 줌아웃에서 커널(화면 px 고정)이 도시보다 커져 '경계 밖 빨간 원'으로 수렴하는 것 완화 —
    // 레벨별 반경. heatScale.heatRadiusForLevel 을 빌드 시점에 평가한 표(공식 단일 소스).
    var HEAT_RADIUS_BY_LEVEL = ${HEAT_RADIUS_BY_LEVEL_JSON};
    function heatRadiusForLevel(lvl){
      return HEAT_RADIUS_BY_LEVEL[lvl] || ${HEAT_RADIUS_MIN};
    }
    function heatRedraw(){
      if (MODE !== 'heatmap') return;
      var proj = map.getProjection();
      // 뷰포트 밖 점은 커널 반경(R) 밖이라 화면 픽셀에 기여하지 못함 → 제외.
      // (화면 밖 점이 h337 colorize 영역을 캔버스 전체로 키우던 비대 차단 — 줌인 pan 비용 감소)
      // h337.configure({radius})는 store 에 반영되지 않으므로 점별 radius 로 전달.
      var W = heatEl.clientWidth, H = heatEl.clientHeight;
      var R = heatRadiusForLevel(map.getLevel());
      var data = [];
      for (var i = 0; i < HEAT_POINTS.length; i++) {
        var p = HEAT_POINTS[i];
        var pt = proj.containerPointFromCoords(new kakao.maps.LatLng(p.lat, p.lng));
        if (pt.x < -R || pt.x > W + R || pt.y < -R || pt.y > H + R) continue;
        data.push({ x: Math.round(pt.x), y: Math.round(pt.y), value: p.value || 1, radius: R });
      }
      heat.setData({ max: ${HEAT_MAX}, data: data });
    }
    // pan 중 bounds_changed 가 폭주 → rAF 로 프레임당 1회로 합침.
    // heatmap 모드가 아니면 스케줄 자체를 건너뛴다(기본 markers 모드 pan 마다 rAF 낭비 방지).
    // 줌 애니메이션 중에도 스킵 — 타일 로드·스케일 전환만으로 비싼 구간이라 히트 재계산을
    // 끝난 뒤 1회로 미룬다(전환 중 ~0.3초 히트가 어긋났다 스냅되는 트레이드오프).
    function heatSchedule(){
      if (MODE !== 'heatmap') return;
      if (heatZooming) return;
      if (heatPending) return;
      heatPending = true;
      requestAnimationFrame(function(){ heatPending = false; heatRedraw(); });
    }
    function applyHeat(){
      if (MODE === 'heatmap') heatSchedule();
      else heat.setData({ max: ${HEAT_MAX}, data: [] }); // 캔버스는 두되 비워서 투명
    }
    kakao.maps.event.addListener(map, 'zoom_start', function(){ heatZooming = true; });
    kakao.maps.event.addListener(map, 'zoom_changed', function(){ heatZooming = false; heatSchedule(); });
    // idle 에서도 해제 — zoom_changed 없이 끝나는 제스처(취소 등)로 플래그가 박제되는 것 방지.
    kakao.maps.event.addListener(map, 'idle', function(){ heatZooming = false; heatSchedule(); });
    kakao.maps.event.addListener(map, 'bounds_changed', heatSchedule);
    // 회전/리사이즈 시 webview relayout — setData 는 캔버스 치수를 안 바꾸므로 configure 로 리사이즈 후 재계산.
    window.addEventListener('resize', function(){
      heat.configure({ width: heatEl.clientWidth, height: heatEl.clientHeight });
      heatSchedule();
    });

    // KWCAG 1.4.1 — status 별 색 + 형상 + 라벨 3중 인코딩 SVG.
    // count>1: 우상단 카운트 뱃지 + 라벨 absolute(좌표 정확도 무손실).
    function buildMarkerHtml(m){
      var color = m.color || '#2563eb';
      var shape = m.shape || 'circle';
      var badge = m.badge || '';
      var count = m.count || 1;
      var svg;
      if (shape === 'triangle') {
        svg = '<svg width="26" height="26" viewBox="0 0 36 36"><polygon points="18,4 32,30 4,30" fill="' + color + '" stroke="#fff" stroke-width="2"/></svg>';
      } else if (shape === 'check') {
        svg = '<svg width="26" height="26" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="' + color + '" stroke="#fff" stroke-width="2"/><polyline points="11,18 16,23 25,13" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      } else {
        svg = '<svg width="26" height="26" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="' + color + '" stroke="#fff" stroke-width="2"/></svg>';
      }
      var countBadge = count > 1
        ? '<div style="position:absolute;top:-4px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.25);box-sizing:border-box;">' + count + '</div>'
        : '';
      var labelHtml = '<div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;background:#fff;padding:2px 6px;border-radius:8px;font-size:11px;font-weight:600;color:#0f172a;border:1px solid ' + color + ';white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.15);">' + (badge ? '<span style="color:' + color + ';">' + badge + '</span> · ' : '') + (m.label||'') + '</div>';
      return '<div style="position:relative;width:26px;height:26px;cursor:pointer;">' + svg + countBadge + labelHtml + '</div>';
    }

    // === 마커 레이어 (히트맵은 위 캔버스로 분리) ===
    var markerOverlays = [];

    function clearMarkerLayer(){
      for (var i = 0; i < markerOverlays.length; i++) markerOverlays[i].setMap(null);
      markerOverlays = [];
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
      if (MODE === 'markers') renderMarkers(); // heatmap=캔버스 오버레이, choropleth=구역 색만
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
    // 히트맵 점 — [{lat,lng,value}]. value 는 동일좌표 군집 count(가중). 모드 가드는 heatSchedule 몫.
    window.__mfzSetHeatPoints = function(pts){ HEAT_POINTS = pts || []; heatSchedule(); };
    window.__mfzSetMode = function(mode){ MODE = mode; applyData(); applyBoundaryStyle(); applyHeat(); };
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
