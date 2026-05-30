import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';
import { radius } from '@/theme/spacing';

interface Props {
  lat: number;
  lng: number;
  onDragEnd: (lat: number, lng: number) => void;
  height?: number;
}

const SDK_SCRIPT_ID = '__kakao_maps_sdk__';

type Overlay = { setMap: (m: unknown | null) => void; setPosition: (p: unknown) => void; getPosition: () => { getLat: () => number; getLng: () => number } };
type KakaoGlobal = {
  maps: {
    load: (cb: () => void) => void;
    LatLng: new (lat: number, lng: number) => unknown;
    Map: new (container: HTMLElement, options: { center: unknown; level: number }) => unknown;
    Marker: new (options: { position: unknown; map: unknown; draggable?: boolean }) => Overlay;
    event: {
      addListener: (target: unknown, type: string, handler: (e?: { latLng: { getLat: () => number; getLng: () => number } }) => void) => void;
    };
  };
};

function getKakao(): KakaoGlobal | null {
  const w = window as unknown as { kakao?: KakaoGlobal };
  return w.kakao ?? null;
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
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appkey)}&autoload=false`;
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

export function FieldPinMap({ lat, lng, onDragEnd, height = 220 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const kakaoJsKey = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';
  const markerRef = useRef<Overlay | null>(null);

  // 마운트 1회 — 좌표 변경은 RN state 가 진실값, 마커는 자체 위치 유지.
  useEffect(() => {
    if (!kakaoJsKey || !containerRef.current) return;
    let cancelled = false;
    loadKakaoSdk(kakaoJsKey).then(() => {
      if (cancelled || !containerRef.current) return;
      const k = getKakao();
      if (!k) return;
      const map = new k.maps.Map(containerRef.current, {
        center: new k.maps.LatLng(lat, lng),
        level: 3,
      });
      const marker = new k.maps.Marker({
        position: new k.maps.LatLng(lat, lng),
        map,
        draggable: true,
      });
      markerRef.current = marker;
      k.maps.event.addListener(marker, 'dragend', () => {
        const p = marker.getPosition();
        onDragEnd(p.getLat(), p.getLng());
      });
      k.maps.event.addListener(map, 'click', (e) => {
        const p = e?.latLng;
        if (!p) return;
        marker.setPosition(p);
        onDragEnd(p.getLat(), p.getLng());
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoJsKey]);

  if (!kakaoJsKey) return null;

  return (
    <View style={[styles.container, { height }]}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
});
