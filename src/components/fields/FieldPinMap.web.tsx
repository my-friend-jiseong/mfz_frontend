import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PinAddress } from '@/utils/addressSearch';
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
  // 네이티브 전용 — shape 만 맞춘다(호출하지 않음). 안드로이드는 부모 ScrollView 가 지도
  // 드래그를 가로채 이 신호로 스크롤을 잠그지만, 웹은 카카오 SDK 가 컨테이너에
  // touch-action:none 을 걸어 경합이 없다. 여기서 호출하면 오히려 웹 스크롤이 잠긴다.
  onInteractionChange?: (active: boolean) => void;
}

// 마운트 후 임의 시점에 핀 이동 + 역지오코딩을 트리거하는 명령형 핸들
// — "현 위치에서 시작" 재시도처럼 지도가 이미 떠 있는 상태에서 주소를 다시 받아올 때.
// FieldPinMap.tsx(native) 와 동일 shape 유지.
export interface FieldPinMapHandle {
  resolveAddress: (lat: number, lng: number) => void;
}

const SDK_SCRIPT_ID = '__kakao_maps_sdk__';

type Overlay = { setMap: (m: unknown | null) => void; setPosition: (p: unknown) => void; getPosition: () => { getLat: () => number; getLng: () => number } };
type KakaoMap = { setCenter: (latlng: unknown) => void };
type RegionPart = {
  address_name: string;
  region_1depth_name?: string;
  region_2depth_name?: string;
  building_name?: string;
};
type Coord2AddressItem = { road_address: RegionPart | null; address: RegionPart | null };
type Geocoder = {
  coord2Address: (
    lng: number,
    lat: number,
    cb: (result: Coord2AddressItem[], status: string) => void,
  ) => void;
};
type KakaoGlobal = {
  maps: {
    load: (cb: () => void) => void;
    LatLng: new (lat: number, lng: number) => unknown;
    Map: new (container: HTMLElement, options: { center: unknown; level: number }) => KakaoMap;
    Marker: new (options: { position: unknown; map: unknown; draggable?: boolean }) => Overlay;
    event: {
      addListener: (target: unknown, type: string, handler: (e?: { latLng: { getLat: () => number; getLng: () => number } }) => void) => void;
    };
    services: {
      Geocoder: new () => Geocoder;
      Status: { OK: string };
    };
  };
};

function getKakao(): KakaoGlobal | null {
  const w = window as unknown as { kakao?: KakaoGlobal };
  return w.kakao ?? null;
}

// kakao coord2Address 결과 → 공용 PinAddress 정규화.
function toPinAddress(item: Coord2AddressItem): PinAddress {
  const road = item.road_address;
  const jibun = item.address;
  const base = road ?? jibun;
  const roadAddress = road?.address_name ?? '';
  const jibunAddress = jibun?.address_name ?? '';
  const buildingName = road?.building_name || null;
  const display = buildingName
    ? `${roadAddress} (${buildingName})`
    : roadAddress || jibunAddress;
  return {
    roadAddress,
    jibunAddress,
    buildingName,
    sido: base?.region_1depth_name || undefined,
    sigungu: base?.region_2depth_name || undefined,
    display,
  };
}

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

export const FieldPinMap = forwardRef<FieldPinMapHandle, Props>(function FieldPinMap(
  { lat, lng, onDragEnd, resolveInitialAddress = false, height = 220 },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
  const markerRef = useRef<Overlay | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const geocoderRef = useRef<Geocoder | null>(null);
  // 사용자 본인 이동 좌표 — prop 으로 되돌아오면 재센터를 건너뛴다(중앙 고정 버그 차단).
  const lastEmittedRef = useRef<{ lat: number; lng: number } | null>(null);

  const safeLat = Number.isFinite(lat) ? lat : 0;
  const safeLng = Number.isFinite(lng) ? lng : 0;
  const initialLatRef = useRef(safeLat);
  const initialLngRef = useRef(safeLng);
  const resolveInitialRef = useRef(resolveInitialAddress);
  // SDK 로드 후 effect 안에서 만들어지는 emitAddress 를 명령형 핸들에서 쓰기 위한 통로.
  const emitAddressRef = useRef<((la: number, ln: number) => void) | null>(null);
  // SDK 로드 전에 들어온 resolveAddress 요청 — 로드 완료 직후 flush (silent drop 방지).
  const pendingResolveRef = useRef<{ lat: number; lng: number } | null>(null);

  // 마운트 1회 — 후속 lat/lng prop 변경은 아래 useEffect 가 in-place 처리.
  useEffect(() => {
    if (!kakaoJsKey || !containerRef.current) return;
    let cancelled = false;
    loadKakaoSdk(kakaoJsKey).then(() => {
      if (cancelled || !containerRef.current) return;
      const k = getKakao();
      if (!k) return;
      const map = new k.maps.Map(containerRef.current, {
        center: new k.maps.LatLng(initialLatRef.current, initialLngRef.current),
        level: 3,
      });
      mapRef.current = map;
      const marker = new k.maps.Marker({
        position: new k.maps.LatLng(initialLatRef.current, initialLngRef.current),
        map,
        draggable: true,
      });
      markerRef.current = marker;
      const geocoder = new k.maps.services.Geocoder();
      geocoderRef.current = geocoder;
      // 주소만 역지오코딩 후 emit — 초기 1회(resolveInitial)와 이동 후속 공용.
      const emitAddress = (la: number, ln: number) => {
        geocoder.coord2Address(ln, la, (result, status) => {
          // stale 가드 — 응답 대기 중 핀이 이동했으면 폐기 (늦게 온 응답이 새 좌표를 되돌리는 race 차단).
          const cur = marker.getPosition();
          if (Math.abs(cur.getLat() - la) > 1e-9 || Math.abs(cur.getLng() - ln) > 1e-9) return;
          if (status === k.maps.services.Status.OK && result[0]) {
            lastEmittedRef.current = { lat: la, lng: ln };
            onDragEnd(la, ln, toPinAddress(result[0]));
          }
        });
      };
      emitAddressRef.current = emitAddress;
      // 좌표는 즉시, 주소는 역지오코딩 콜백 후 후속 전달.
      const emitMove = (la: number, ln: number) => {
        lastEmittedRef.current = { lat: la, lng: ln };
        onDragEnd(la, ln);
        emitAddress(la, ln);
      };
      k.maps.event.addListener(marker, 'dragend', () => {
        const p = marker.getPosition();
        emitMove(p.getLat(), p.getLng());
      });
      k.maps.event.addListener(map, 'click', (e) => {
        const p = e?.latLng;
        if (!p) return;
        marker.setPosition(p);
        emitMove(p.getLat(), p.getLng());
      });
      // 현 위치 시작 플로우 — 초기 좌표의 주소를 1회 역지오코딩해 채운다.
      if (resolveInitialRef.current) {
        emitAddress(initialLatRef.current, initialLngRef.current);
      }
      // SDK 로드 전에 들어온 resolveAddress 요청 flush.
      const pending = pendingResolveRef.current;
      if (pending) {
        pendingResolveRef.current = null;
        const p = new k.maps.LatLng(pending.lat, pending.lng);
        marker.setPosition(p);
        map.setCenter(p);
        emitAddress(pending.lat, pending.lng);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoJsKey]);

  // 후속 lat/lng prop 변경 — marker + map in-place 이동.
  // 사용자 본인 이동(lastEmitted)이면 재센터 생략 — 외부 변경(주소 재선택)만 재센터.
  useEffect(() => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const le = lastEmittedRef.current;
    if (le && Math.abs(le.lat - lat) < 1e-9 && Math.abs(le.lng - lng) < 1e-9) return;
    const k = getKakao();
    if (!k || !mapRef.current || !markerRef.current) return;
    const p = new k.maps.LatLng(lat, lng);
    markerRef.current.setPosition(p);
    mapRef.current.setCenter(p);
  }, [lat, lng]);

  useImperativeHandle(ref, () => ({
    resolveAddress: (la: number, ln: number) => {
      if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
      if (!emitAddressRef.current) {
        // SDK 로드 전 — 적재해 두면 mount effect 가 로드 완료 직후 flush.
        pendingResolveRef.current = { lat: la, lng: ln };
        return;
      }
      const k = getKakao();
      if (k && mapRef.current && markerRef.current) {
        const p = new k.maps.LatLng(la, ln);
        markerRef.current.setPosition(p);
        mapRef.current.setCenter(p);
      }
      emitAddressRef.current(la, ln);
    },
  }));

  if (!kakaoJsKey) return null;

  return (
    <View style={[styles.container, { height }]}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
});
