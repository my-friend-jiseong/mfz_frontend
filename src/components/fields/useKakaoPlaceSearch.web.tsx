import { useCallback } from 'react';
import type { AddressSearchItem } from '@/api';

// 웹: 카카오 JS SDK 를 직접 로드해 services.Places.keywordSearch 로 장소명 검색.
// (네이티브는 .tsx 의 헤드리스 WebView 브릿지 — 동일 인터페이스 { search, element })

const SDK_SCRIPT_ID = '__kakao_maps_sdk__';

type PlaceItem = {
  place_name?: string;
  road_address_name?: string;
  address_name?: string;
  x?: string;
  y?: string;
};
type Places = {
  keywordSearch: (q: string, cb: (data: PlaceItem[], status: string) => void) => void;
};
type KakaoGlobal = {
  maps: {
    load: (cb: () => void) => void;
    services: { Places: new () => Places; Status: { OK: string } };
  };
};

function getKakao(): KakaoGlobal | null {
  const w = window as unknown as { kakao?: KakaoGlobal };
  return w.kakao ?? null;
}

// FieldPinMap.web 과 동일한 script id 사용 → 어느 쪽이 먼저 로드해도 공유.
function loadKakaoSdk(appkey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('no window'));
      return;
    }
    const existing = getKakao();
    if (existing?.maps?.load) {
      existing.maps.load(() => resolve());
      return;
    }
    const prior = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (prior) {
      prior.addEventListener('load', () => {
        const k = getKakao();
        if (k?.maps?.load) k.maps.load(() => resolve());
        else reject(new Error('kakao not loaded'));
      });
      prior.addEventListener('error', () => reject(new Error('script error')));
      return;
    }
    const script = document.createElement('script');
    script.id = SDK_SCRIPT_ID;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appkey)}&autoload=false&libraries=services`;
    script.async = true;
    script.onload = () => {
      const k = getKakao();
      if (k?.maps?.load) k.maps.load(() => resolve());
      else reject(new Error('kakao not loaded'));
    };
    script.onerror = () => reject(new Error('script error'));
    document.head.appendChild(script);
  });
}

function toItem(d: PlaceItem): AddressSearchItem {
  return {
    roadAddress: d.road_address_name || '',
    jibunAddress: d.address_name || '',
    buildingName: d.place_name || null,
    sido: '',
    sigungu: '',
    lat: Number(d.y),
    lng: Number(d.x),
  };
}

export function useKakaoPlaceSearch() {
  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

  const search = useCallback(
    (query: string): Promise<AddressSearchItem[]> => {
      const q = query.trim();
      if (!kakaoJsKey || q.length < 1) return Promise.resolve([]);
      return loadKakaoSdk(kakaoJsKey)
        .then(
          () =>
            new Promise<AddressSearchItem[]>((resolve) => {
              const k = getKakao();
              if (!k) {
                resolve([]);
                return;
              }
              const places = new k.maps.services.Places();
              places.keywordSearch(q, (data, status) => {
                if (status !== k.maps.services.Status.OK || !Array.isArray(data)) {
                  resolve([]);
                  return;
                }
                resolve(data.map(toItem));
              });
            }),
        )
        .catch(() => []);
    },
    [kakaoJsKey],
  );

  // 웹은 렌더할 브릿지 엘리먼트 불필요.
  return { search, element: null as null };
}
