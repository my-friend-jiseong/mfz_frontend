import { useCallback } from 'react';
import type { AddressSearchItem } from '@/api';
import { placeCategoryLabel } from '@/utils/addressFormat';
import type { ReverseAddress } from './useKakaoPlaceSearch';

// 웹: 카카오 JS SDK 를 직접 로드해 services.Places.keywordSearch 로 장소명 검색.
// (네이티브는 .tsx 의 헤드리스 WebView 브릿지 — 동일 인터페이스 { search, element })

const SDK_SCRIPT_ID = '__kakao_maps_sdk__';
// 위치 기준 장소 검색 반경(카카오 상한 20km).
const PLACE_RADIUS_M = 20000;
// SDK 로드·검색·좌표→주소 각각의 제한 시간(네이티브 브리지와 같은 6초).
const SDK_TIMEOUT_MS = 6000;
const REQUEST_TIMEOUT_MS = 6000;

type PlaceItem = {
  place_name?: string;
  category_name?: string;
  road_address_name?: string;
  address_name?: string;
  x?: string;
  y?: string;
};
type Places = {
  keywordSearch: (
    q: string,
    cb: (data: PlaceItem[], status: string) => void,
    opts?: { location?: unknown; radius?: number; sort?: unknown },
  ) => void;
};
type RegionPart = { address_name: string; region_1depth_name?: string; region_2depth_name?: string };
type Geocoder = {
  coord2Address: (
    lng: number,
    lat: number,
    cb: (result: { road_address: RegionPart | null; address: RegionPart | null }[], status: string) => void,
  ) => void;
};
type KakaoGlobal = {
  maps: {
    load: (cb: () => void) => void;
    LatLng: new (lat: number, lng: number) => unknown;
    services: {
      Places: new () => Places;
      Geocoder: new () => Geocoder;
      Status: { OK: string };
      SortBy: { DISTANCE: unknown; ACCURACY: unknown };
    };
  };
};

function getKakao(): KakaoGlobal | null {
  const w = window as unknown as { kakao?: KakaoGlobal };
  return w.kakao ?? null;
}

// FieldPinMap.web 과 동일한 script id 사용 → 어느 쪽이 먼저 로드해도 공유.
// 앞서 붙은 스크립트가 이미 실패했거나 끝내 안 오면 load/error 가 다시 오지 않아 영원히 기다린다 —
// 제한 시간 뒤 실패로 끝내고, kakao 가 없으면 그 스크립트를 떼어 다음 호출이 새로 붙이게 한다.
function loadKakaoSdk(appkey: string): Promise<void> {
  const attempt = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      reject(new Error('no window'));
      return;
    }
    const existing = getKakao();
    if (existing?.maps?.load) {
      existing.maps.load(() => resolve());
      return;
    }
    const onLoad = () => {
      const k = getKakao();
      if (k?.maps?.load) k.maps.load(() => resolve());
      else reject(new Error('kakao not loaded'));
    };
    const prior = document.getElementById(SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (prior) {
      prior.addEventListener('load', onLoad);
      prior.addEventListener('error', () => reject(new Error('script error')));
      return;
    }
    const script = document.createElement('script');
    script.id = SDK_SCRIPT_ID;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appkey)}&autoload=false&libraries=services`;
    script.async = true;
    script.onload = onLoad;
    script.onerror = () => reject(new Error('script error'));
    document.head.appendChild(script);
  });
  return withTimeout(attempt, SDK_TIMEOUT_MS, () => new Error('kakao sdk timeout')).catch((e: unknown) => {
    if (typeof document !== 'undefined' && !getKakao()) document.getElementById(SDK_SCRIPT_ID)?.remove();
    throw e;
  });
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T | Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const h = setTimeout(() => {
      const v = onTimeout();
      if (v instanceof Error) reject(v);
      else resolve(v);
    }, ms);
    p.then(
      (v) => {
        clearTimeout(h);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(h);
        reject(e);
      },
    );
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
    placeCategory: placeCategoryLabel(d.category_name),
  };
}

export function useKakaoPlaceSearch() {
  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

  // near 를 주면 그 근처(반경 PLACE_RADIUS_M, 가까운 순)부터 찾고, 근처에 없으면 전국에서 다시 찾는다.
  const search = useCallback(
    (query: string, near?: { lat: number; lng: number } | null): Promise<AddressSearchItem[]> => {
      const q = query.trim();
      if (!kakaoJsKey || q.length < 1) return Promise.resolve([]);
      const job = loadKakaoSdk(kakaoJsKey)
        .then(() => {
          const k = getKakao();
          // services 가 없으면(다른 로더가 libraries 없이 먼저 로드한 경우) 조용히 빈 결과.
          if (!k || !k.maps.services) return [] as AddressSearchItem[];
          const places = new k.maps.services.Places();
          const run = (opts?: { location: unknown; radius: number; sort: unknown }) =>
            new Promise<AddressSearchItem[]>((resolve) => {
              places.keywordSearch(
                q,
                (data, status) => {
                  if (status !== k.maps.services.Status.OK || !Array.isArray(data)) {
                    resolve([]);
                    return;
                  }
                  resolve(data.map(toItem));
                },
                opts,
              );
            });
          if (!near) return run();
          return run({
            location: new k.maps.LatLng(near.lat, near.lng),
            radius: PLACE_RADIUS_M,
            sort: k.maps.services.SortBy.DISTANCE,
          }).then((items) => (items.length > 0 ? items : run()));
        })
        .catch(() => [] as AddressSearchItem[]);
      // 근처 검색 + 전국 다시 찾기까지 합쳐 제한 시간 — 넘으면 빈 결과(주소 검색 결과는 그대로 보인다).
      return withTimeout(job, REQUEST_TIMEOUT_MS, () => [] as AddressSearchItem[]);
    },
    [kakaoJsKey],
  );

  // 좌표 → 주소(4-3 길게 눌러 고른 위치).
  const reverse = useCallback(
    (lat: number, lng: number): Promise<ReverseAddress | null> => {
      if (!kakaoJsKey) return Promise.resolve(null);
      const job = loadKakaoSdk(kakaoJsKey)
        .then(
          () =>
            new Promise<ReverseAddress | null>((resolve) => {
              const k = getKakao();
              if (!k || !k.maps.services) {
                resolve(null);
                return;
              }
              new k.maps.services.Geocoder().coord2Address(lng, lat, (result, status) => {
                const r = status === k.maps.services.Status.OK ? result?.[0] : undefined;
                if (!r) {
                  resolve(null);
                  return;
                }
                const base = r.road_address ?? r.address;
                resolve({
                  roadAddress: r.road_address?.address_name ?? '',
                  jibunAddress: r.address?.address_name ?? '',
                  sido: base?.region_1depth_name ?? '',
                  sigungu: base?.region_2depth_name ?? '',
                });
              });
            }),
        )
        .catch(() => null);
      return withTimeout(job, REQUEST_TIMEOUT_MS, () => null);
    },
    [kakaoJsKey],
  );

  // 웹은 렌더할 브릿지 엘리먼트 불필요.
  return { search, reverse, element: null as null };
}
