import type { Router } from 'expo-router';
import { reports as reportsApi } from '@/api';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { notice } from '@/components/ui/ConfirmDialog';
import { reportStateNow } from '@/utils/reportStatus';
import { tripTitle } from '@/utils/tripFormat';

/** 9-2 보고서 작성 · 9-6 보고서 수정(같은 화면, 루트 모달). */
export const reportEditHref = (reportId: string, mode: 'create' | 'edit') =>
  ({ pathname: '/report-edit', params: { id: reportId, mode } }) as const;

/** 9-3 보고서 상세(보고서 탭 스택). */
export const reportDetailHref = (reportId: string) =>
  ({ pathname: '/(tabs)/reports/[id]', params: { id: reportId } }) as const;

/** 외근 보고서를 서버에서 찾는다. 없으면 null, 조회에 실패하면 'error'. */
export async function findTripReportId(tripId: string): Promise<string | null | 'error'> {
  try {
    // tripId 쿼리를 서버가 무시하더라도 틀리지 않게 응답에서 한 번 더 거른다.
    const res = await reportsApi.list({ tripId, limit: 50 });
    return res.items?.find((x) => x.tripId === tripId)?.reportId ?? null;
  } catch {
    return 'error';
  }
}

/**
 * 외근의 체크인 방문 → 현장 보고 순서(방문 시각 순, 같은 현장은 한 번).
 * 사진은 같은 현장의 모든 방문에서 고른다(createWithVisitScaffold).
 */
function scaffoldItems(tripId: string) {
  const visits = useVisitStore
    .getState()
    .byTrip(tripId)
    .filter((v) => v.fieldId)
    .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt));
  const order: string[] = [];
  for (const v of visits) if (!order.includes(v.fieldId)) order.push(v.fieldId);
  return order.map((fieldId) => ({
    fieldId,
    visitIds: visits.filter((v) => v.fieldId === fieldId).map((v) => v.id),
  }));
}

/**
 * 외근 내역·외근 상세의 [보고서 작성]. 9-2 보고서 작성을 연다.
 * 보고서는 이 때 만든다(제목 '{외근 제목} 보고' + 체크인한 현장마다 빈 현장 보고) — 9-2 는 만들어진 보고서를 고치는 화면이다.
 * 로컬 목록이 오래됐을 수 있어(다른 기기에서 만든 보고서) 서버에서 한 번 더 확인하고, 이미 있으면 그 보고서로 보낸다
 * (작성 중이면 9-2, 작성 완료면 9-3) — 같은 외근에 보고서가 두 개 생기지 않게.
 * 확인하지 못하면 안내만 하고 멈춘다. 같은 외근으로 진행 중에 다시 누르면 무시한다.
 */
const openingTrips = new Set<string>();
export async function openReportForTrip(router: Router, tripId: string): Promise<void> {
  if (openingTrips.has(tripId)) return;
  openingTrips.add(tripId);
  try {
    const found = await findTripReportId(tripId);
    if (found === 'error') {
      await notice('보고서를 열지 못했어요', '보고서가 이미 있는지 확인하지 못했어요. 잠시 뒤 다시 해 주세요.');
      return;
    }
    if (found) {
      const detail = await useReportStore.getState().loadDetail(found);
      const draft = detail ? reportStateNow(found).stage === 'draft' : false;
      router.push((draft ? reportEditHref(found, 'create') : reportDetailHref(found)) as never);
      // 목록에 없던 보고서였을 수 있다 — 이동과 같은 틱에 store 를 바꾸지 않고 다음 프레임에 받는다.
      requestAnimationFrame(() => void useReportStore.getState().refresh());
      return;
    }

    // 외근 상세를 안 받았으면 방문이 비어 있다 — 받은 뒤 현장 보고를 만든다.
    if (useVisitStore.getState().byTrip(tripId).length === 0) await useTripStore.getState().loadDetail(tripId);
    const trip = useTripStore.getState().trips.find((t) => t.id === tripId);
    const title = trip ? `${tripTitle(trip)} 보고` : '외근 보고';
    const r = await useReportStore.getState().createWithVisitScaffold({ title, tripId }, scaffoldItems(tripId));
    if (!r.ok) {
      await notice('보고서를 만들지 못했어요', r.error);
      return;
    }
    router.push(reportEditHref(r.report.id, 'create') as never);
    if (r.failedFieldIds.length > 0) {
      // 화면을 연 뒤 알린다 — 빠진 현장은 9-2 [+ 현장 추가]로 다시 넣을 수 있다.
      setTimeout(() => void notice(`현장 ${r.failedFieldIds.length}곳을 넣지 못했어요`, '[현장 추가]로 다시 넣어 주세요.'), 400);
    }
  } finally {
    openingTrips.delete(tripId);
  }
}
