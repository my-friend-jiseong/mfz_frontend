import { useCallback, useState } from 'react';
import { nearestNeighborOrder, type OptimizeNode } from '@/utils/routeOptimize';
import { localizeError, type OptimizedOrderItem } from '@/api';

// 백엔드 optimize-preview·navigation/optimize 공통 패턴 — 서버 우선, 실패하거나
// 응답 개수가 요청과 다르면(누락·중복) 클라이언트 nearest-neighbor 로 폴백.
// order.tsx(외근 시작 전)·active.tsx(재최적화) 둘 다 이 흐름을 그대로 썼는데,
// 개수 불일치 가드가 한쪽에만 있는 등 두 사본이 따로 표류했던 걸 여기로 합쳤다
// (/code-review high 지적).

export interface OptimizeSummary {
  algorithm: string;
  totalDistanceKm: number;
  totalEtaMinutes: number;
}

type OrderedNode<T extends OptimizeNode> = T & {
  distanceFromPrevKm: number;
  etaMinutes: number;
};

export type OptimizeRouteResult<T extends OptimizeNode> =
  | { source: 'server'; ordered: OrderedNode<T>[]; summary: OptimizeSummary }
  | {
      source: 'fallback';
      ordered: OrderedNode<T>[];
      summary: OptimizeSummary;
      /** 폴백으로 넘어간 사유 — 사용자에게 보여줄 한국어 문구. */
      fallbackReason: string;
    };

const MISMATCH_MARKER = '__optimize_mismatch__';

export function useOptimizeRoute() {
  const [optimizing, setOptimizing] = useState(false);

  /**
   * nodes 의 `id` 는 서버가 `optimizedOrder[].fieldId` 로 돌려주는 값과 같아야 한다
   * (요청 쪽 현장 id 자체를 그대로 쓴다 — destId 등 로컬 전용 id 를 쓰는 화면은
   * 호출 전에 fieldId 로 바꿔 넣고, 응답을 받은 뒤 자기 쪽에서 되돌린다).
   */
  const run = useCallback(
    async <T extends OptimizeNode & { name?: string }>(
      start: { lat: number; lng: number },
      nodes: T[],
      callOptimize: (body: {
        startLat: number;
        startLng: number;
        fields: Array<{ fieldId: string; name?: string; lat: number; lng: number }>;
      }) => Promise<{ optimizedOrder: OptimizedOrderItem[]; summary: OptimizeSummary }>,
    ): Promise<OptimizeRouteResult<T>> => {
      setOptimizing(true);
      try {
        try {
          const res = await callOptimize({
            startLat: start.lat,
            startLng: start.lng,
            fields: nodes.map((n) => ({
              fieldId: n.id,
              name: n.name,
              lat: n.lat,
              lng: n.lng,
            })),
          });
          const byId = new Map(nodes.map((n) => [n.id, n]));
          const ordered: OrderedNode<T>[] = [];
          for (const o of res.optimizedOrder) {
            const base = byId.get(o.fieldId);
            if (!base) continue;
            ordered.push({
              ...base,
              distanceFromPrevKm: o.distanceFromPrevKm,
              etaMinutes: o.etaMinutes,
            });
          }
          // 개수가 안 맞으면(누락·중복) 서버 응답을 신뢰하지 않는다 — 조용히 현장이
          // 사라진 채로 반영되는 것보다 클라이언트 폴백이 낫다.
          if (ordered.length !== nodes.length) {
            throw new Error(MISMATCH_MARKER);
          }
          return { source: 'server', ordered, summary: res.summary };
        } catch (e) {
          const fallbackReason =
            e instanceof Error && e.message === MISMATCH_MARKER
              ? '서버 응답이 요청한 목적지 수와 달랐습니다'
              : localizeError(e);
          const ordered = nearestNeighborOrder(start, nodes);
          const totalDistanceKm = ordered.reduce((sum, n) => sum + n.distanceFromPrevKm, 0);
          const totalEtaMinutes = ordered.reduce((sum, n) => sum + n.etaMinutes, 0);
          return {
            source: 'fallback',
            ordered,
            summary: {
              algorithm: 'nearest_neighbor',
              totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
              totalEtaMinutes,
            },
            fallbackReason,
          };
        }
      } finally {
        setOptimizing(false);
      }
    },
    [],
  );

  return { optimizing, run };
}
