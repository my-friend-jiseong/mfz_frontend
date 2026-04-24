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
  id: number;
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

// 카운트를 fillOpacity로 매핑 (0~최댓값 기준)
export function opacityForCount(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 0;
  // 최소 가시성 0.15, 최대 0.6
  const ratio = Math.min(1, count / max);
  return 0.15 + ratio * 0.45;
}
