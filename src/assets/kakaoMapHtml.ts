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

// 베이스 지도 종류 — kakao.maps.MapTypeId 의 ROADMAP/SKYVIEW/HYBRID 에 1:1 대응.
// (markers/heatmap/choropleth 는 '우리 데이터 오버레이'이고, 이건 '카카오 베이스 타일'이라 별개 축.)
export type BaseMapType = 'roadmap' | 'skyview' | 'hybrid';

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
    // 외근 방문 순번(1-based). 있으면 마커 안에 숫자를 새긴다 — 아래 buildMarkerHtml 주석 참고.
    order?: number;
    count?: number;
    groupIds?: string[];
    selected?: boolean;
    highlighted?: boolean;
  }[];
  center: { lat: number; lng: number };
  // 초기 줌 레벨(카카오 1~14, 작을수록 확대). 미지정 시 기본 8. 마지막 뷰 복원에 사용.
  level?: number;
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
  level = 8,
  fitToMarkers = false,
  interactive = true,
}: MapHtmlOptions): string {
  // RN WebView와 웹 iframe 양쪽에서 메시지 전송 가능한 브리지 스크립트
  const postMsgFn = `function postMsg(msg){var s=JSON.stringify(msg);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);}else if(window.parent&&window.parent!==window){window.parent.postMessage(s,'*');}}`;

  // 지도에 손이 닿아 있는 동안을 상위(RN)에 알리는 신호. 스크롤 화면 안에 박힌 지도에서
  // 부모 ScrollView 가 세로 드래그를 가로채는 것을 막는 데 쓴다(KakaoMapWebView
  // onInteractionChange 주석 참고). passive 리스너라 지도 자체 제스처는 그대로 동작한다.
  // 구독자가 없는 화면(배경 지도 등)에선 메시지가 그냥 무시된다.
  const touchBridgeFn = `document.addEventListener('touchstart',function(){postMsg({type:'mapTouch',active:true});},{passive:true});document.addEventListener('touchend',function(){postMsg({type:'mapTouch',active:false});},{passive:true});document.addEventListener('touchcancel',function(){postMsg({type:'mapTouch',active:false});},{passive:true});`;

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
  /* 검색 결과 하이라이트 — 마커 뒤 정적 브랜드 링 + 확장 핑 펄스(검색해 찾은 현장 강조). */
  @keyframes mfzHlPing { 0% { transform: translate(-50%,-50%) scale(0.7); opacity:0.85; } 100% { transform: translate(-50%,-50%) scale(2.4); opacity:0; } }
  .mfz-hl-static { position:absolute; top:50%; left:50%; width:38px; height:38px; transform:translate(-50%,-50%); border-radius:50%; border:3px solid #2563eb; box-shadow:0 0 0 3px rgba(37,99,235,0.22); box-sizing:border-box; }
  .mfz-hl-ping { position:absolute; top:50%; left:50%; width:30px; height:30px; transform:translate(-50%,-50%); border-radius:50%; border:3px solid #2563eb; box-sizing:border-box; animation: mfzHlPing 1.5s ease-out infinite; }
  /* 검색한 '새 위치' 비컨 — 좌표에 떨어뜨리는 핀(끝점이 좌표). 등록 전 위치 확인용. */
  @keyframes mfzBeaconPulse { 0% { transform: translateX(-50%) scale(0.6); opacity:0.65; } 100% { transform: translateX(-50%) scale(2.6); opacity:0; } }
  .mfz-beacon { position:relative; width:30px; height:42px; pointer-events:none; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3)); }
  .mfz-beacon-pulse { position:absolute; left:50%; bottom:2px; width:14px; height:14px; border-radius:50%; background:rgba(37,99,235,0.4); transform:translateX(-50%); animation: mfzBeaconPulse 1.5s ease-out infinite; }
</style>
<script>${HEATMAP_JS_SOURCE}</script>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false"></script>
</head><body>
<div id="mapwrap"><div id="map"></div><div id="heat"><div id="heatInner"></div></div></div>
<script>
(function(){
  var CENTER = { lat: ${center.lat}, lng: ${center.lng} };
  var LEVEL = ${level};
  var FIT_TO_MARKERS = ${fitToMarkers ? 'true' : 'false'};
  var INTERACTIVE = ${interactive ? 'true' : 'false'};
  ${postMsgFn}
  // 조작 불가 지도(interactive=false, 예: 보고서 상세 위치도)는 신호를 보내지 않는다 —
  // 끌 수 없는 지도 때문에 부모 스크롤이 잠기면 손해만 남는다.
  ${interactive ? touchBridgeFn : ''}

  kakao.maps.load(function(){
    var container = document.getElementById('map');
    var map = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(CENTER.lat, CENTER.lng),
      level: LEVEL,
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
    var BASE_MAP_TYPE = 'roadmap';

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
    // 사용자가 직접 끌거나 줌한 뒤에만 현재 뷰(center+level)를 RN 으로 보고 — 지도 생성 시
    // 자동 발화하는 idle 로 보고하면, 안 보이는 탭의 지도가 초기 위치로 값을 덮어쓴다.
    // RN 은 이를 기억해 화면 재마운트(탭 전환·뒤로가기) 시 마지막으로 보던 위치로 복원한다.
    function reportView(){
      var c = map.getCenter();
      postMsg({ type: 'viewchanged', lat: c.getLat(), lng: c.getLng(), level: map.getLevel() });
    }
    kakao.maps.event.addListener(map, 'dragend', reportView);
    kakao.maps.event.addListener(map, 'zoom_changed', reportView);
    kakao.maps.event.addListener(map, 'bounds_changed', heatSchedule);
    // 회전/리사이즈 시 webview relayout — setData 는 캔버스 치수를 안 바꾸므로 configure 로 리사이즈 후 재계산.
    window.addEventListener('resize', function(){
      heat.configure({ width: heatEl.clientWidth, height: heatEl.clientHeight });
      heatSchedule();
    });

    // 라벨은 일정 줌 이상(레벨 ≤ 이 값)에서만 노출 — 밀집 시 라벨 박스가 서로 겹쳐
    // 난잡해지는 것 방지. 멀리서 보면 점만, 가까이 가면 동 이름이 붙는 단계적 디테일.
    var LABEL_MAX_LEVEL = 5;
    // 화면상 이 픽셀 반경 안의 마커는 한 클러스터로 묶는다(줌마다 재계산).
    // 마커 SVG 가 26px 이라 28 이면 사실상 겹치는 것만 묶음 — 점을 최대한 살려 허전함 방지.
    var CLUSTER_PX = 28;

    // KWCAG 1.4.1 — status 별 색 + 형상 + 라벨 3중 인코딩 SVG.
    // count>1: 우상단 카운트 뱃지. showLabel 일 때만 동 이름 라벨을 SVG 아래에 띄움.
    function buildMarkerHtml(m, count, showLabel, orderOverride){
      var color = m.color || '#2563eb';
      var shape = m.shape || 'circle';
      var badge = m.badge || '';
      // 선택 표시(현장 선택 모드) — 상태색·형상은 유지하고 brand 링 + ✓ 만 덧댄다(KWCAG: 색 단독 X).
      // 클러스터(count>1)는 카운트 뱃지와 충돌·의미 모호 → 단일 마커에만. (그룹은 모달이 개별 표시)
      var selected = m.selected && count === 1;
      // 검색 하이라이트(단일 마커) — selected(외근 선택 ✓)와 독립. 정적 링 + 핑 펄스.
      var highlighted = m.highlighted && count === 1;
      var hlRing = highlighted
        ? '<div class="mfz-hl-static"></div><div class="mfz-hl-ping"></div>'
        : '';
      var selRing = selected
        ? '<div style="position:absolute;top:50%;left:50%;width:34px;height:34px;transform:translate(-50%,-50%);border:3px solid #2563eb;border-radius:50%;box-sizing:border-box;box-shadow:0 0 0 2px #fff;"></div>'
        : '';
      var selCheck = selected
        ? '<div style="position:absolute;bottom:-5px;right:-5px;width:16px;height:16px;border-radius:50%;background:#2563eb;border:2px solid #fff;display:flex;align-items:center;justify-content:center;box-sizing:border-box;"><svg width="9" height="9" viewBox="0 0 24 24"><polyline points="4,12 10,18 20,6" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
        : '';
      // 외근 순번 마커 — order 가 있으면 형상 대신 '숫자를 새긴 원' 으로 그린다.
      // KWCAG 1.4.1(색 단독 금지)은 그대로 지켜진다: 정보 전달자가 형상에서 숫자로 바뀔 뿐,
      // 색 없이도 순서를 읽을 수 있다. 체크 아이콘/삼각형 위에 숫자를 겹치면 둘 다 안 읽혀
      // 형상 인코딩을 유지하는 쪽이 오히려 정보를 잃는다.
      //
      // 클러스터(count>1)도 순번을 살린다 — 같은 건물에 목적지가 2곳이면 예전엔 카운트 뱃지만
      // 남아 방문 순서를 아예 못 읽었다. 원 안에는 클러스터에서 가장 빠른 순번(orderOverride),
      // 우상단에는 기존 카운트 뱃지를 함께 둬 "여기서 N곳, 첫 순번은 M" 으로 읽히게 한다.
      //
      // ★ 라벨에 status 뱃지(조치 전/중/완료)를 반드시 유지할 것. 순번 마커는 형상을 원으로
      //   고정하므로, 라벨에서까지 status 텍스트를 빼면 status 가 '색 단독' 인코딩이 되어
      //   KWCAG 1.4.1 을 어긴다(초기 구현이 실제로 그랬다). 라벨이 안 뜨는 넓은 줌에서는
      //   여전히 색만 남는 한계가 있어, 외근 화면은 목록에서 status 를 텍스트로 함께 제공한다.
      var ord = (orderOverride !== undefined && orderOverride !== null) ? orderOverride : m.order;
      if (typeof ord === 'number') {
        var ordCount = count > 1
          ? '<div style="position:absolute;top:-4px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#dc2626;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.25);box-sizing:border-box;">' + count + '</div>'
          : '';
        return '<div style="position:relative;width:26px;height:26px;cursor:pointer;">' + hlRing + selRing
          + '<svg width="26" height="26" viewBox="0 0 36 36"><circle cx="18" cy="18" r="14" fill="' + color + '" stroke="#fff" stroke-width="2"/></svg>'
          + '<div style="position:absolute;top:0;left:0;width:26px;height:26px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;pointer-events:none;">' + ord + '</div>'
          + ordCount
          + selCheck
          + (showLabel ? '<div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;background:#fff;padding:2px 6px;border-radius:8px;font-size:11px;font-weight:600;color:#0f172a;border:1px solid ' + color + ';white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.15);">' + (badge ? '<span style="color:' + color + ';">' + badge + '</span> · ' : '') + (m.label||'') + '</div>' : '')
          + '</div>';
      }
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
      var labelHtml = showLabel
        ? '<div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;background:#fff;padding:2px 6px;border-radius:8px;font-size:11px;font-weight:600;color:#0f172a;border:1px solid ' + color + ';white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.15);">' + (badge ? '<span style="color:' + color + ';">' + badge + '</span> · ' : '') + (m.label||'') + '</div>'
        : '';
      return '<div style="position:relative;width:26px;height:26px;cursor:pointer;">' + hlRing + selRing + svg + countBadge + selCheck + labelHtml + '</div>';
    }

    // 화면 픽셀 거리 기반 클러스터링. 두 좌표의 화면상 거리는 pan 에 불변(평행이동)이고
    // 줌에만 의존하므로 줌 변화 시에만 재계산하면 된다. 그리드 버킷으로 인접 3×3 셀만 검사해
    // O(n) 에 가깝게 묶는다. 각 클러스터는 head(첫 마커) 좌표에 그려 좌표 무손실.
    function clusterMarkers(){
      var proj = map.getProjection();
      var buckets = {}; // "gx:gy" -> [cluster]
      var clusters = [];
      for (var i = 0; i < MARKERS.length; i++) {
        var m = MARKERS[i];
        var pt = proj.containerPointFromCoords(new kakao.maps.LatLng(m.lat, m.lng));
        var gx = Math.floor(pt.x / CLUSTER_PX), gy = Math.floor(pt.y / CLUSTER_PX);
        var placed = null;
        for (var dx = -1; dx <= 1 && !placed; dx++) {
          for (var dy = -1; dy <= 1 && !placed; dy++) {
            var arr = buckets[(gx + dx) + ':' + (gy + dy)];
            if (!arr) continue;
            for (var c = 0; c < arr.length; c++) {
              var cl = arr[c];
              var ddx = cl.px - pt.x, ddy = cl.py - pt.y;
              if (ddx * ddx + ddy * ddy <= CLUSTER_PX * CLUSTER_PX) { placed = cl; break; }
            }
          }
        }
        if (placed) {
          placed.count++;
          placed.ids.push(m.id);
          // 클러스터가 보여줄 순번 = 구성원 중 가장 빠른 것. head 는 좌표 무손실을 위해
          // 첫 마커로 고정해야 하므로 순번만 따로 최솟값으로 모은다.
          if (typeof m.order === 'number' && (placed.minOrder === null || m.order < placed.minOrder)) {
            placed.minOrder = m.order;
          }
        } else {
          var nc = { head: m, px: pt.x, py: pt.y, count: 1, ids: [m.id],
                     minOrder: (typeof m.order === 'number' ? m.order : null) };
          clusters.push(nc);
          var bk = gx + ':' + gy;
          (buckets[bk] = buckets[bk] || []).push(nc);
        }
      }
      return clusters;
    }

    // === 외근 경로선 ===
    // 목적지 순서대로 잇는 점선. 마커 레이어와 독립이라 표시 방식(markers/heatmap/choropleth)
    // 전환에도 살아있다 — "이 외근이 어떤 동선이었나" 는 오버레이 종류와 무관한 정보.
    var ROUTE = [];
    var routeLine = null;
    function applyRoute(){
      if (routeLine) { routeLine.setMap(null); routeLine = null; }
      if (!ROUTE || ROUTE.length < 2) return;
      var path = [];
      for (var i = 0; i < ROUTE.length; i++) {
        path.push(new kakao.maps.LatLng(ROUTE[i].lat, ROUTE[i].lng));
      }
      routeLine = new kakao.maps.Polyline({
        path: path,
        strokeWeight: 4,
        strokeColor: '#2563eb',
        strokeOpacity: 0.7,
        strokeStyle: 'shortdash',
      });
      routeLine.setMap(map);
    }

    // === 마커 레이어 (히트맵은 위 캔버스로 분리) ===
    var markerOverlays = [];

    function clearMarkerLayer(){
      for (var i = 0; i < markerOverlays.length; i++) markerOverlays[i].setMap(null);
      markerOverlays = [];
    }

    function renderMarkers(){
      var showLabel = map.getLevel() <= LABEL_MAX_LEVEL;
      clusterMarkers().forEach(function(cl){
        var head = cl.head;
        var content = document.createElement('div');
        // 라벨은 단일 마커이면서 충분히 줌인했을 때만 — 클러스터는 카운트 뱃지로 다중임을 표현.
        content.innerHTML = buildMarkerHtml(head, cl.count, showLabel && cl.count === 1, cl.minOrder);
        (function(c){
          content.firstChild.addEventListener('click', function(){
            if (c.count > 1) {
              postMsg({ type: 'markerGroupPress', groupIds: c.ids });
            } else {
              postMsg({ type: 'markerPress', fieldId: c.head.id });
            }
          });
        })(cl);
        var ov = new kakao.maps.CustomOverlay({
          position: new kakao.maps.LatLng(head.lat, head.lng),
          content: content,
          map: map,
          // anchor 박스 = SVG 26×26. 중앙(0.5,0.5)이 좌표에 정확히 정렬되어 줌 무관 정확.
          xAnchor: 0.5,
          yAnchor: 0.5,
        });
        markerOverlays.push(ov);
      });
    }

    // 줌이 바뀌면 클러스터 묶임과 라벨 노출이 달라지므로 마커 레이어만 다시 그린다(프레이밍은 유지).
    // pan 은 픽셀 거리 불변이라 재계산 불필요. zoom_changed 폭주는 rAF 로 프레임당 1회로 합침.
    var markerRerenderPending = false;
    function scheduleMarkerRerender(){
      if (MODE !== 'markers') return;
      if (markerRerenderPending) return;
      markerRerenderPending = true;
      requestAnimationFrame(function(){
        markerRerenderPending = false;
        if (MODE !== 'markers') return;
        clearMarkerLayer();
        renderMarkers();
      });
    }
    kakao.maps.event.addListener(map, 'zoom_changed', scheduleMarkerRerender);

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
    window.__mfzSetRoute = function(pts){ ROUTE = pts || []; applyRoute(); };
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

    // === 검색한 '새 위치' 비컨 ===
    // 주소·장소 검색 결과를 고르면 그 좌표에 핀을 떨어뜨려 어디인지 보여준다(등록은 사용자 선택).
    var beaconOverlay = null;
    function applyBeacon(b){
      if (beaconOverlay) { beaconOverlay.setMap(null); beaconOverlay = null; }
      if (!b) return;
      var content = document.createElement('div');
      content.innerHTML = '<div class="mfz-beacon"><div class="mfz-beacon-pulse"></div><svg width="30" height="42" viewBox="0 0 30 42"><path d="M15 1 C7.3 1 1 7.3 1 15 C1 25.5 15 41 15 41 C15 41 29 25.5 29 15 C29 7.3 22.7 1 15 1 Z" fill="#2563eb" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#fff"/></svg></div>';
      beaconOverlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(b.lat, b.lng),
        content: content,
        map: map,
        xAnchor: 0.5,
        yAnchor: 1,
        zIndex: 6,
      });
    }
    window.__mfzSetBeacon = function(b){ applyBeacon(b); };

    // === 베이스 지도 종류 ===
    // setMapTypeId 는 베이스 타일만 교체 — 마커·히트맵 캔버스·경계 폴리곤은 위에 그대로 유지된다.
    function baseMapTypeId(t){
      if (t === 'skyview') return kakao.maps.MapTypeId.SKYVIEW;
      if (t === 'hybrid') return kakao.maps.MapTypeId.HYBRID;
      return kakao.maps.MapTypeId.ROADMAP;
    }
    window.__mfzSetBaseMapType = function(t){
      BASE_MAP_TYPE = t || 'roadmap';
      map.setMapTypeId(baseMapTypeId(BASE_MAP_TYPE));
    };

    // 타일 페인트 완료 신호 — 보고서 위치도 네이티브 캡처(view-shot)가 빈 지도를 찍지
    // 않도록 호출 측이 이 신호 후 캡처. 초기·pan/zoom 마다 발화하므로 캡처 측이 디바운스.
    kakao.maps.event.addListener(map, 'tilesloaded', function(){
      postMsg({ type: 'tilesloaded' });
    });

    // 초기엔 빈 지도 — 마커·경계·현재위치는 ready 직후 RN 이 주입.
    postMsg({ type: 'ready' });
  });
})();
</script>
</body></html>`;
}
