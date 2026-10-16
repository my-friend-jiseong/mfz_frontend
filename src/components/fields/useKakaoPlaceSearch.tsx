import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { AddressSearchItem } from '@/api';
import { KAKAO_WEBVIEW_BASE_URL } from '@/utils/kakaoMap';
import { placeCategoryLabel } from '@/utils/addressFormat';

/** 좌표 → 주소(카카오 Geocoder.coord2Address). 4-3 길게 눌러 고른 위치에 쓴다. */
export interface ReverseAddress {
  roadAddress: string;
  jibunAddress: string;
  sido: string;
  sigungu: string;
}

// 카카오 장소(키워드) 검색을 클라이언트에서 수행하는 헤드리스 브릿지.
// 백엔드 /address/search 는 도로명 주소만 매칭 → "동아대학교" 같은 POI 는 0건.
// JS SDK 의 services.Places.keywordSearch 로 장소명을 보완한다 (REST 키 불필요, JS 키만).
//
// 네이티브는 카카오 SDK 가 WebView 안에서만 동작하므로 화면 밖(0x0) WebView 를 띄워
// injectJavaScript ↔ postMessage 로 비동기 검색을 중계한다. (웹은 .web 에서 직접 SDK 호출)
export function useKakaoPlaceSearch() {
  const webRef = useRef<WebView>(null);
  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
  const pendingRef = useRef<Map<number, (items: AddressSearchItem[]) => void>>(new Map());
  const pendingReverseRef = useRef<Map<number, (r: ReverseAddress | null) => void>>(new Map());
  const reqIdRef = useRef(0);
  // WebView 로드 완료 전엔 injectJavaScript 가 유실될 수 있어 ready 후에만 주입.
  // 로드 전 들어온 요청은 차례대로 쌓아 두고 onLoadEnd 에서 모두 보낸다(검색과 좌표→주소가 섞여도 잃지 않게).
  const readyRef = useRef(false);
  const queuedJsRef = useRef<string[]>([]);
  // 브리지가 사라지면 다음에 붙을 때까지 준비 전으로 돌린다.
  useEffect(
    () => () => {
      readyRef.current = false;
    },
    [],
  );

  const search = useCallback(
    (query: string, near?: { lat: number; lng: number } | null): Promise<AddressSearchItem[]> => {
      const q = query.trim();
      if (!kakaoJsKey || q.length < 1) return Promise.resolve([]);
      const reqId = ++reqIdRef.current;
      return new Promise((resolve) => {
        pendingRef.current.set(reqId, resolve);
        // SDK 가 아직 로드 전이면 __mfzPendingSearches 에 쌓음 → kakao.maps.load 콜백에서 처리.
        const nearJs = near ? JSON.stringify({ lat: near.lat, lng: near.lng }) : 'null';
        const js = `(function(){var q=${JSON.stringify(q)};var n=${nearJs};if(window.__mfzSearch){window.__mfzSearch(${reqId},q,n);}else{(window.__mfzPendingSearches=window.__mfzPendingSearches||[]).push([${reqId},q,n]);}})();true;`;
        if (readyRef.current) webRef.current?.injectJavaScript(js);
        else queuedJsRef.current.push(js);
        // 안전 타임아웃 — SDK 무응답/미로드 시 빈 결과로 종결(promise 누수 방지).
        setTimeout(() => {
          const r = pendingRef.current.get(reqId);
          if (r) {
            pendingRef.current.delete(reqId);
            r([]);
          }
        }, 6000);
      });
    },
    [kakaoJsKey],
  );

  const reverse = useCallback(
    (lat: number, lng: number): Promise<ReverseAddress | null> => {
      if (!kakaoJsKey) return Promise.resolve(null);
      const reqId = ++reqIdRef.current;
      return new Promise((resolve) => {
        pendingReverseRef.current.set(reqId, resolve);
        const js = `(function(){if(window.__mfzReverse){window.__mfzReverse(${reqId},${lat},${lng});}else{(window.__mfzPendingReverses=window.__mfzPendingReverses||[]).push([${reqId},${lat},${lng}]);}})();true;`;
        if (readyRef.current) webRef.current?.injectJavaScript(js);
        else queuedJsRef.current.push(js);
        setTimeout(() => {
          const r = pendingReverseRef.current.get(reqId);
          if (r) {
            pendingReverseRef.current.delete(reqId);
            r(null);
          }
        }, 6000);
      });
    },
    [kakaoJsKey],
  );

  // 0×0 WebView 는 일부 플랫폼에서 JS 가 실행되지 않음 → 화면 좌상단에 1×1 로 두되 invisible.
  const element = kakaoJsKey ? (
    <View
      style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0 }}
      pointerEvents="none"
    >
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: buildSearchHtml(kakaoJsKey), baseUrl: KAKAO_WEBVIEW_BASE_URL }}
        javaScriptEnabled
        domStorageEnabled
        // 다시 불러오는 동안(웹뷰 재시작 등)에는 주입하지 않고 쌓아 둔다.
        onLoadStart={() => {
          readyRef.current = false;
        }}
        onLoadEnd={() => {
          readyRef.current = true;
          const queued = queuedJsRef.current;
          queuedJsRef.current = [];
          for (const js of queued) webRef.current?.injectJavaScript(js);
        }}
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'searchResult' && typeof msg.reqId === 'number') {
              const resolve = pendingRef.current.get(msg.reqId);
              if (resolve) {
                pendingRef.current.delete(msg.reqId);
                const items: (AddressSearchItem & { categoryName?: string })[] = Array.isArray(msg.items) ? msg.items : [];
                resolve(items.map(({ categoryName, ...it }) => ({ ...it, placeCategory: placeCategoryLabel(categoryName) })));
              }
            } else if (msg.type === 'reverseResult' && typeof msg.reqId === 'number') {
              const resolve = pendingReverseRef.current.get(msg.reqId);
              if (resolve) {
                pendingReverseRef.current.delete(msg.reqId);
                resolve(msg.address ?? null);
              }
            }
          } catch {
            // ignore
          }
        }}
        style={{ width: 1, height: 1, backgroundColor: 'transparent' }}
      />
    </View>
  ) : null;

  return { search, reverse, element };
}

function buildSearchHtml(kakaoJsKey: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false&libraries=services"></script>
</head><body>
<script>
(function(){
  function postMsg(m){var s=JSON.stringify(m);if(window.ReactNativeWebView){window.ReactNativeWebView.postMessage(s);}}
  kakao.maps.load(function(){
    var places = new kakao.maps.services.Places();
    // near 가 있으면 그 근처(20km, 가까운 순)부터, 근처에 없으면 전국에서 다시.
    window.__mfzSearch = function(reqId, q, near){
      if (near) {
        places.keywordSearch(q, function(data, status){
          if (status === kakao.maps.services.Status.OK && data && data.length) return window.__mfzSearchDone(reqId, data, status);
          window.__mfzSearch(reqId, q, null);
        }, { location: new kakao.maps.LatLng(near.lat, near.lng), radius: 20000, sort: kakao.maps.services.SortBy.DISTANCE });
        return;
      }
      places.keywordSearch(q, function(data, status){ window.__mfzSearchDone(reqId, data, status); });
    };
    window.__mfzSearchDone = function(reqId, data, status){
      (function(){
        var items = [];
        if(status === kakao.maps.services.Status.OK && data){
          for(var i=0;i<data.length;i++){
            var d = data[i];
            items.push({
              roadAddress: d.road_address_name || '',
              jibunAddress: d.address_name || '',
              buildingName: d.place_name || null,
              categoryName: d.category_name || '',
              sido: '', sigungu: '',
              lat: parseFloat(d.y), lng: parseFloat(d.x)
            });
          }
        }
        postMsg({ type: 'searchResult', reqId: reqId, items: items });
      })();
    };
    var geocoder = new kakao.maps.services.Geocoder();
    window.__mfzReverse = function(reqId, lat, lng){
      geocoder.coord2Address(lng, lat, function(result, status){
        var r = (status === kakao.maps.services.Status.OK && result) ? result[0] : null;
        var address = null;
        if (r) {
          var base = r.road_address || r.address || {};
          address = {
            roadAddress: r.road_address ? r.road_address.address_name : '',
            jibunAddress: r.address ? r.address.address_name : '',
            sido: base.region_1depth_name || '', sigungu: base.region_2depth_name || ''
          };
        }
        postMsg({ type: 'reverseResult', reqId: reqId, address: address });
      });
    };
    var pendR = window.__mfzPendingReverses || []; window.__mfzPendingReverses = null;
    for (var ri = 0; ri < pendR.length; ri++) window.__mfzReverse(pendR[ri][0], pendR[ri][1], pendR[ri][2]);
    var pend = window.__mfzPendingSearches || []; window.__mfzPendingSearches = null;
    for (var pi = 0; pi < pend.length; pi++) window.__mfzSearch(pend[pi][0], pend[pi][1], pend[pi][2]);
  });
})();
</script>
</body></html>`;
}
