import { useFieldStore } from '@/stores/fieldStore';
import type { Field } from '@/types/entities';
import type { ReverseAddress } from '@/components/fields/useKakaoPlaceSearch';
import { regionOf } from './addressFormat';

// 등록 안 된 위치(4-1 주소·장소 결과, 4-3 지도에서 고른 위치, 5-2)를 외근 목적지에 담을 때 현장으로 저장한다
// (5-2 '외근 목적지에 추가하면 현장으로 저장돼요.').

export interface PlaceTarget {
  /** 장소 이름(낙동초등학교). 주소·지도에서 고른 위치는 비운다 → 현장명 기본값은 주소. */
  name?: string | null;
  roadAddress: string;
  jibunAddress: string;
  sido?: string;
  sigungu?: string;
  lat: number;
  lng: number;
}

/**
 * reverse: 좌표 → 주소(useKakaoPlaceSearch). 장소 검색·지도에서 고른 위치는 시·도·시·군·구가 비어 오므로 채운다.
 * 그래도 모르면 주소 글에서 읽는다 — 다른 지역 값이 섞여 저장되지 않게 모르는 값은 보내지 않는다.
 */
export async function createFieldFromPlace(
  input: PlaceTarget,
  reverse?: (lat: number, lng: number) => Promise<ReverseAddress | null>,
): Promise<{ ok: true; field: Field } | { ok: false; error: string }> {
  let p = input;
  if ((!p.sido || !p.sigungu || !p.jibunAddress || !p.roadAddress) && reverse) {
    const r = await reverse(p.lat, p.lng);
    if (r) {
      p = {
        ...p,
        roadAddress: p.roadAddress || r.roadAddress,
        jibunAddress: p.jibunAddress || r.jibunAddress,
        sido: p.sido || r.sido,
        sigungu: p.sigungu || r.sigungu,
      };
    }
  }
  const address = p.roadAddress || p.jibunAddress;
  if (!address) return { ok: false, error: '주소를 확인하지 못했어요. 다른 곳을 골라 주세요.' };
  if (!p.sido || !p.sigungu) {
    const parsed = regionOf(address);
    p = { ...p, sido: p.sido || parsed.sido, sigungu: p.sigungu || parsed.sigungu };
  }
  const body = {
    name: p.name?.trim() || address,
    status: 'pending' as const,
    roadAddress: address,
    ...(p.jibunAddress ? { jibunAddress: p.jibunAddress } : {}),
    detailAddress: '',
    lat: p.lat,
    lng: p.lng,
    ...(p.sido ? { sido: p.sido } : {}),
    ...(p.sigungu ? { sigungu: p.sigungu } : {}),
  };
  const create = useFieldStore.getState().create;
  let r = await create(body);
  // 같은 주소의 현장이 이미 있어도 사용자가 이 위치를 골랐으니 그대로 만든다(서버 중복 경고는 확인용).
  if (!r.ok && 'needsConfirm' in r) r = await create({ ...body, forceCreateWithDuplicate: true });
  if (r.ok) return { ok: true, field: r.field };
  return { ok: false, error: 'error' in r ? r.error : r.message };
}
