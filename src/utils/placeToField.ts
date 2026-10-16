import { useFieldStore } from '@/stores/fieldStore';
import type { Field } from '@/types/entities';

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

export async function createFieldFromPlace(p: PlaceTarget): Promise<{ ok: true; field: Field } | { ok: false; error: string }> {
  const address = p.roadAddress || p.jibunAddress;
  if (!address) return { ok: false, error: '주소를 확인하지 못했어요. 다른 곳을 골라 주세요.' };
  const body = {
    name: p.name?.trim() || address,
    status: 'pending' as const,
    roadAddress: address,
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
