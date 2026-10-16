import type { MapPinKind } from '@/components/KakaoMapWebView';
import { c2 } from '@/theme/v2';

// 핀 종류별 대표 색 — 3-8 경로 순서 카드의 순번 원, 지도 마커의 color(2차 핀은 종류가 색을 정해 무시되지만 필수 칸).
export const STATUS_PIN_COLOR: Record<MapPinKind, string> = {
  pending: c2.status.pending,
  in_progress: c2.status.inProgress,
  done: c2.status.done,
  new: c2.status.new,
  search: c2.bg.brand,
  visited: c2.status.visited,
  skipped: c2.status.visited,
};
