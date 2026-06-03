// 시/군/구 행정구역 경계 로더
// 소스: southkorea/southkorea-maps (2018, 단순화 TopoJSON 553KB)
// 좌표계: WGS84 (EPSG:4326)

import { feature } from 'topojson-client';
import type { Topology, GeometryCollection as TopoGC } from 'topojson-specification';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import topo from './sigungu-topo.json';

export interface SigunguProps {
  name: string; // 한글 지역명 (예: "종로구")
  name_eng: string;
  code: string;
  base_year: string;
}

export type SigunguFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  SigunguProps
>;

let cache: SigunguFeatureCollection | null = null;

export function loadSigunguGeoJson(): SigunguFeatureCollection {
  if (cache) return cache;
  const topology = topo as unknown as Topology;
  const objKey = Object.keys(topology.objects)[0];
  const obj = topology.objects[objKey] as TopoGC;
  const fc = feature(topology, obj) as unknown as SigunguFeatureCollection;
  cache = fc;
  return fc;
}

// ray-casting point-in-polygon (ring = [lng, lat][])
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInFeature(
  lng: number,
  lat: number,
  feat: SigunguFeatureCollection['features'][number],
): boolean {
  const geom = feat.geometry;
  const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer) continue;
    if (pointInRing(lng, lat, outer as number[][])) {
      // 구멍(holes) 검사는 프로토타입에선 생략
      return true;
    }
  }
  return false;
}

export interface GeoPoint {
  id: string;
  lat: number;
  lng: number;
}

// 각 현장이 속한 시/군/구 코드 → 카운트 집계
export function aggregateByRegion(
  points: GeoPoint[],
  fc: SigunguFeatureCollection,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of points) {
    for (const feat of fc.features) {
      if (pointInFeature(p.lng, p.lat, feat)) {
        const code = feat.properties.code;
        counts.set(code, (counts.get(code) ?? 0) + 1);
        break;
      }
    }
  }
  return counts;
}

// 카운트 → fillOpacity 매핑은 theme/choroplethScale.fillOpacityForCount 로 이관(절대 구간).
// 지도 렌더·범례가 같은 척도를 공유하기 위함.

export interface BoundaryRingFeature {
  code: string;
  rings: number[][][]; // 외곽 링들 (각 ring = [lng,lat][]). holes 는 제외(렌더에서 미사용).
}

let ringsCache: BoundaryRingFeature[] | null = null;

// 폴리곤 외곽 링만 추출한 슬림 지오메트리.
// 네이티브 WebView 에 그대로 주입해 런타임 fetch/CDN 없이 경계·단계구분도를 그리기 위함
// — 좌표 변환·집계는 RN(TS) 한 곳에서만 하고 HTML 은 표시만 담당. 지오메트리는 정적이라 1회 캐시.
export function getBoundaryRings(): BoundaryRingFeature[] {
  if (ringsCache) return ringsCache;
  const fc = loadSigunguGeoJson();
  const out: BoundaryRingFeature[] = [];
  for (const feat of fc.features) {
    const geom = feat.geometry;
    const polygons = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    const rings: number[][][] = [];
    for (const polygon of polygons) {
      const outer = polygon[0];
      if (outer) rings.push(outer as number[][]);
    }
    if (rings.length > 0) out.push({ code: feat.properties.code, rings });
  }
  ringsCache = out;
  return out;
}
