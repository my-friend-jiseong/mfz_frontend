import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { AddressSearchItem } from '@/api';

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
  const reqIdRef = useRef(0);
  // WebView 로드 완료 전엔 injectJavaScript 가 유실될 수 있어 ready 후에만 주입.
  // 로드 전 들어온 검색은 lastJsRef 에 보관(최신 1건만 — latest-wins) → onLoadEnd 에서 flush.
  const readyRef = useRef(false);
  const lastJsRef = useRef<string | null>(null);

  const search = useCallback(
    (query: string): Promise<AddressSearchItem[]> => {
      const q = query.trim();
      if (!kakaoJsKey || q.length < 1) return Promise.resolve([]);
      const reqId = ++reqIdRef.current;
      return new Promise((resolve) => {
        pendingRef.current.set(reqId, resolve);
        // SDK 가 아직 로드 전이면 __mfzPendingSearch 에 보관 → kakao.maps.load 콜백에서 처리.
        const js = `(function(){var q=${JSON.stringify(q)};if(window.__mfzSearch){window.__mfzSearch(${reqId},q);}else{window.__mfzPendingSearch={reqId:${reqId},q:q};}})();true;`;
        if (readyRef.current) {
          webRef.current?.injectJavaScript(js);
        } else {
          lastJsRef.current = js;
        }
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

  // 0×0 WebView 는 일부 플랫폼에서 JS 가 실행되지 않음 → 화면 좌상단에 1×1 로 두되 invisible.
  const element = kakaoJsKey ? (
    <View
      style={{ position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0 }}
      pointerEvents="none"
    >
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: buildSearchHtml(kakaoJsKey) }}
        javaScriptEnabled
        domStorageEnabled
        onLoadEnd={() => {
          readyRef.current = true;
          if (lastJsRef.current) {
            webRef.current?.injectJavaScript(lastJsRef.current);
            lastJsRef.current = null;
          }
        }}
        onMessage={(event) => {
          try {
            const msg = JSON.parse(event.nativeEvent.data);
            if (msg.type === 'searchResult' && typeof msg.reqId === 'number') {
              const resolve = pendingRef.current.get(msg.reqId);
              if (resolve) {
                pendingRef.current.delete(msg.reqId);
                resolve(Array.isArray(msg.items) ? msg.items : []);
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

  return { search, element };
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
    window.__mfzSearch = function(reqId, q){
      places.keywordSearch(q, function(data, status){
        var items = [];
        if(status === kakao.maps.services.Status.OK && data){
          for(var i=0;i<data.length;i++){
            var d = data[i];
            items.push({
              roadAddress: d.road_address_name || '',
              jibunAddress: d.address_name || '',
              buildingName: d.place_name || null,
              sido: '', sigungu: '',
              lat: parseFloat(d.y), lng: parseFloat(d.x)
            });
          }
        }
        postMsg({ type: 'searchResult', reqId: reqId, items: items });
      });
    };
    if(window.__mfzPendingSearch){ var ps = window.__mfzPendingSearch; window.__mfzPendingSearch = null; window.__mfzSearch(ps.reqId, ps.q); }
  });
})();
</script>
</body></html>`;
}
