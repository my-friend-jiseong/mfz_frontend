// 8-7 사진으로 여러 곳 등록 — 사진을 위치별로 묶는다(인수인계 '외근 · 사진으로 여러 곳 등록').
// RN/expo import 없는 순수 모듈 — node 단위 테스트 대상(src/utils/__tests__/photoGroups.test.ts).
//
// - 100m 안에 기존 현장이 있으면 가장 가까운 현장 묶음(그 현장에 사진 추가)
// - 아니면 100m 안의 다른 새 묶음에 합치고, 없으면 새 묶음(새 현장)
// - 위치 없는 사진은 묶지 않는다. 지도에서 지정하면(8-8) 위와 같은 규칙으로 기존 묶음에 합치거나 새 묶음을 맨 뒤에 붙인다(8-14)
import { haversineKm } from './routeOptimize';

export const PHOTO_GROUP_RADIUS_M = 100;

export interface LocatedPhoto {
  key: string;
  lat: number | null;
  lng: number | null;
  /** ISO. 묶음 순서(먼저 찍은 곳이 1번)에 쓴다. */
  takenAt: string;
}

export interface GroupField {
  id: string;
  latitude: number;
  longitude: number;
}

export interface PhotoGroup {
  key: string;
  /** 묶음 기준 위치 — 기존 현장이면 그 현장 좌표, 새 현장이면 처음 들어온 사진 위치. */
  lat: number;
  lng: number;
  /** 기존 현장이면 그 id. null 이면 새 현장. */
  fieldId: string | null;
  photoKeys: string[];
}

const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => haversineKm(a, b) * 1000;

function nearestField(pos: { lat: number; lng: number }, fields: readonly GroupField[], radiusM: number): GroupField | null {
  let best: GroupField | null = null;
  let bestD = Infinity;
  for (const f of fields) {
    if (!Number.isFinite(f.latitude) || !Number.isFinite(f.longitude)) continue;
    const d = distM(pos, { lat: f.latitude, lng: f.longitude });
    if (d <= radiusM && d < bestD) {
      best = f;
      bestD = d;
    }
  }
  return best;
}

function nearestGroup(
  pos: { lat: number; lng: number },
  groups: readonly PhotoGroup[],
  radiusM: number,
  only?: (g: PhotoGroup) => boolean,
): PhotoGroup | null {
  let best: PhotoGroup | null = null;
  let bestD = Infinity;
  for (const g of groups) {
    if (only && !only(g)) continue;
    const d = distM(pos, g);
    if (d <= radiusM && d < bestD) {
      best = g;
      bestD = d;
    }
  }
  return best;
}

/** 한 장을 묶음 목록에 넣는다(목록은 새로 만든다). 기존 현장 > 가까운 묶음 > 새 묶음. */
function place(
  groups: PhotoGroup[],
  photo: { key: string; lat: number; lng: number },
  fields: readonly GroupField[],
  radiusM: number,
): PhotoGroup[] {
  const pos = { lat: photo.lat, lng: photo.lng };
  const field = nearestField(pos, fields, radiusM);
  // 기존 현장 근처라도 이미 더 가까운 묶음이 그 현장을 쓰고 있으면 그 묶음으로.
  const target = field
    ? groups.find((g) => g.fieldId === field.id) ?? null
    : nearestGroup(pos, groups, radiusM, (g) => g.fieldId === null);
  if (target) {
    return groups.map((g) => (g === target ? { ...g, photoKeys: [...g.photoKeys, photo.key] } : g));
  }
  const created: PhotoGroup = field
    ? { key: `field:${field.id}`, lat: field.latitude, lng: field.longitude, fieldId: field.id, photoKeys: [photo.key] }
    : { key: `new:${photo.key}`, lat: photo.lat, lng: photo.lng, fieldId: null, photoKeys: [photo.key] };
  return [...groups, created];
}

/** 처음 묶기. 먼저 찍은 사진부터 넣어 묶음 번호가 다닌 순서가 되게 한다. 위치 없는 사진 key 는 따로 돌려준다. */
export function groupPhotos(
  photos: readonly LocatedPhoto[],
  fields: readonly GroupField[],
  radiusM = PHOTO_GROUP_RADIUS_M,
): { groups: PhotoGroup[]; unlocated: string[] } {
  const sorted = [...photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  let groups: PhotoGroup[] = [];
  const unlocated: string[] = [];
  for (const p of sorted) {
    if (p.lat === null || p.lng === null) {
      unlocated.push(p.key);
      continue;
    }
    groups = place(groups, { key: p.key, lat: p.lat, lng: p.lng }, fields, radiusM);
  }
  return { groups, unlocated };
}

/**
 * 위치 없는 사진을 지도에서 지정했다(8-8 [이 위치로 지정]). 처음 묶을 때와 같은 규칙:
 * 100m 안 기존 현장이 먼저(그 현장 묶음에 합치거나 새로 붙임), 아니면 100m 안 새 묶음에 합치고, 없으면 새 묶음을 맨 뒤에(8-14).
 */
export function assignPhotoLocation(
  groups: readonly PhotoGroup[],
  photoKey: string,
  pos: { lat: number; lng: number },
  fields: readonly GroupField[],
  radiusM = PHOTO_GROUP_RADIUS_M,
): PhotoGroup[] {
  return place([...groups], { key: photoKey, ...pos }, fields, radiusM);
}

/** 묶음 안 사진의 capturedAt 이 겹치지 않게(서버 재전송 중복 판정이 capturedAt 으로 한다) 1ms 씩 민다. */
export function uniqueTimes(times: readonly string[]): string[] {
  const seen = new Set<string>();
  return times.map((t) => {
    let ms = new Date(t).getTime();
    if (!Number.isFinite(ms)) ms = Date.now();
    let iso = new Date(ms).toISOString();
    while (seen.has(iso)) {
      ms += 1;
      iso = new Date(ms).toISOString();
    }
    seen.add(iso);
    return iso;
  });
}
