// Kakao Maps JS SDK를 WebView에 임베드할 HTML 문자열 생성
// KAKAO_JS_KEY 없으면 placeholder 렌더

export type MapDisplayMode = 'markers' | 'heatmap' | 'choropleth';

interface MapHtmlOptions {
  kakaoJsKey: string;
  // shape/badge: KWCAG 1.4.1 색각이상 대응 — 색 단독 표현 금지, 형상·라벨 동반.
  markers: {
    id: string;
    lat: number;
    lng: number;
    label: string;
    color: string;
    shape?: 'triangle' | 'circle' | 'check';
    badge?: string;
  }[];
  center: { lat: number; lng: number };
  displayMode?: MapDisplayMode;
  showBoundary?: boolean;
}

export function buildKakaoMapHtml({
  kakaoJsKey,
  markers,
  center,
  displayMode = 'markers',
  showBoundary = false,
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

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<style>
  html,body{margin:0;padding:0;height:100%;width:100%;}
  #map{height:100%;width:100%;}
  #banner{position:absolute;top:12px;left:12px;right:12px;background:#d97706ee;color:#fff;padding:10px 14px;border-radius:8px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:13px;line-height:1.4;z-index:10;display:none;}
</style>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false"></script>
<script src="https://cdn.jsdelivr.net/npm/topojson-client@3"></script>
</head><body>
<div id="map"></div>
<div id="banner"></div>
<script>
(function(){
  var MARKERS = ${markersJson};
  var CENTER = { lat: ${center.lat}, lng: ${center.lng} };
  var MODE = ${modeLiteral};
  var SHOW_BOUNDARY = ${showBoundaryLiteral};
  var BOUNDARY_URL = 'https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-topo-simple.json';
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

    // KWCAG 1.4.1 — status 별 색 + 형상 + 라벨 3중 인코딩 SVG
    function buildMarkerHtml(m){
      var color = m.color || '#2563eb';
      var shape = m.shape || 'circle';
      var badge = m.badge || '';
      var svg;
      if (shape === 'triangle') {
        svg = '<svg width="36" height="36" viewBox="0 0 36 36"><polygon points="18,4 32,30 4,30" fill="' + color + '" stroke="#fff" stroke-width="2"/></svg>';
      } else if (shape === 'check') {
        svg = '<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="' + color + '" stroke="#fff" stroke-width="2"/><polyline points="11,18 16,23 25,13" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      } else {
        svg = '<svg width="36" height="36" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="' + color + '" stroke="#fff" stroke-width="2"/></svg>';
      }
      var labelHtml = '<div style="background:#fff;padding:2px 6px;border-radius:8px;font-size:11px;font-weight:600;color:#0f172a;border:1px solid ' + color + ';margin-top:2px;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.15);">' + (badge ? '<span style="color:' + color + ';">' + badge + '</span> · ' : '') + (m.label||'') + '</div>';
      return '<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;min-width:44px;min-height:44px;justify-content:center;">' + svg + labelHtml + '</div>';
    }

    function renderMarkers(){
      MARKERS.forEach(function(m){
        var pos = new kakao.maps.LatLng(m.lat, m.lng);
        var content = document.createElement('div');
        content.innerHTML = buildMarkerHtml(m);
        content.firstChild.addEventListener('click', function(){
          postMsg({ type: 'markerPress', fieldId: m.id });
        });
        new kakao.maps.CustomOverlay({
          position: pos,
          content: content,
          map: map,
          yAnchor: 1,
        });
      });
    }

    function renderHeatmap(){
      // heatmap.js 없이 Circle 오버레이로 밀도 근사
      MARKERS.forEach(function(m){
        var circle = new kakao.maps.Circle({
          center: new kakao.maps.LatLng(m.lat, m.lng),
          radius: 500,
          strokeWeight: 0,
          fillColor: '#dc2626',
          fillOpacity: 0.28,
        });
        circle.setMap(map);
      });
    }

    function pointInRing(lng, lat, ring){
      var inside = false;
      for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        var xi = ring[i][0], yi = ring[i][1];
        var xj = ring[j][0], yj = ring[j][1];
        var intersect = ((yi > lat) !== (yj > lat)) &&
          (lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi);
        if (intersect) inside = !inside;
      }
      return inside;
    }
    function pointInFeature(lng, lat, ft){
      var polys = ft.geometry.type === 'Polygon' ? [ft.geometry.coordinates] : ft.geometry.coordinates;
      for (var i = 0; i < polys.length; i++) {
        var outer = polys[i][0];
        if (outer && pointInRing(lng, lat, outer)) return true;
      }
      return false;
    }
    function opacityForCount(c, max){
      if (c <= 0 || max <= 0) return 0;
      return 0.15 + Math.min(1, c / max) * 0.45;
    }

    function renderPolygons(){
      if (!window.topojson) return;
      var isChoropleth = MODE === 'choropleth';
      if (!SHOW_BOUNDARY && !isChoropleth) return;

      fetch(BOUNDARY_URL)
        .then(function(r){ return r.json(); })
        .then(function(topo){
          var key = Object.keys(topo.objects)[0];
          var fc = window.topojson.feature(topo, topo.objects[key]);

          var counts = {};
          var maxCount = 0;
          if (isChoropleth) {
            for (var i = 0; i < MARKERS.length; i++) {
              var m = MARKERS[i];
              for (var j = 0; j < fc.features.length; j++) {
                if (pointInFeature(m.lng, m.lat, fc.features[j])) {
                  var code = fc.features[j].properties.code;
                  counts[code] = (counts[code] || 0) + 1;
                  if (counts[code] > maxCount) maxCount = counts[code];
                  break;
                }
              }
            }
          }

          fc.features.forEach(function(ft){
            var geom = ft.geometry;
            var polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
            var regionCount = counts[ft.properties.code] || 0;
            var choroplethOpacity = isChoropleth ? opacityForCount(regionCount, maxCount) : 0;
            polys.forEach(function(polygon){
              var outer = polygon[0];
              if (!outer) return;
              var path = outer.map(function(c){ return new kakao.maps.LatLng(c[1], c[0]); });
              var p = new kakao.maps.Polygon({
                path: path,
                strokeWeight: SHOW_BOUNDARY ? 1.5 : 0.8,
                strokeColor: '#004c80',
                strokeOpacity: SHOW_BOUNDARY ? 0.6 : 0.3,
                strokeStyle: 'solid',
                fillColor: '#2563eb',
                fillOpacity: isChoropleth ? choroplethOpacity : 0,
              });
              p.setMap(map);
            });
          });
        })
        .catch(function(e){ console.error('boundary/choropleth load failed', e); });
    }

    if (MODE === 'heatmap') {
      renderHeatmap();
    } else {
      // markers · choropleth 모두 마커 표시
      renderMarkers();
    }

    renderPolygons();

    postMsg({ type: 'ready' });
  });
})();
</script>
</body></html>`;
}
