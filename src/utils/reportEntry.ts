import type { Router } from 'expo-router';
import { reports as reportsApi } from '@/api';
import { useReportStore } from '@/stores/reportStore';
import { useTripStore } from '@/stores/tripStore';
import { useVisitStore } from '@/stores/visitStore';
import { confirm, notice } from '@/components/ui/ConfirmDialog';
import { useReportCompletionStore } from '@/stores/reportCompletionStore';
import { reportStateNow } from '@/utils/reportStatus';
import { tripTitle } from '@/utils/tripFormat';

/** 9-2 보고서 작성 · 9-6 보고서 수정(같은 화면, 루트 모달). */
export const reportEditHref = (reportId: string, mode: 'create' | 'edit', failed?: number) =>
  ({ pathname: '/report-edit', params: { id: reportId, mode, ...(failed ? { failed: String(failed) } : {}) } }) as const;

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

/** 외근의 체크인 방문 → 현장 보고 순서(방문 시각 순, 같은 현장은 한 번). */
function scaffoldItems(tripId: string) {
  const visits = useVisitStore
    .getState()
    .byTrip(tripId)
    .filter((v) => v.fieldId)
    .sort((a, b) => a.visitedAt.localeCompare(b.visitedAt));
  const order: string[] = [];
  for (const v of visits) if (!order.includes(v.fieldId)) order.push(v.fieldId);
  return order.map((fieldId) => ({ fieldId }));
}

/**
 * 외근 내역·외근 상세의 [보고서 작성]. 9-2 보고서 작성을 연다.
 * 보고서는 이 때 만든다(제목 '{외근 제목} 보고' + 체크인한 현장마다 빈 현장 보고) — 9-2 는 만들어진 보고서를 고치는 화면이다.
 * 로컬 목록이 오래됐을 수 있어(다른 기기에서 만든 보고서) 서버에서 한 번 더 확인하고, 이미 있으면 그 보고서로 보낸다
 * (작성 중이면 9-2, 작성 완료면 9-3) — 같은 외근에 보고서가 두 개 생기지 않게.
 * 확인하지 못하면 안내만 하고 멈춘다. 같은 외근으로 진행 중에 다시 누르면 무시한다.
 */
const openingTrips = new Set<string>();
/** 화면을 옮겼으면 true — 호출 측이 버튼 상태를 이동과 같은 틱에 바꾸지 않게. */
export async function openReportForTrip(router: Router, tripId: string): Promise<boolean> {
  if (openingTrips.has(tripId)) return false;
  openingTrips.add(tripId);
  try {
    const found = await findTripReportId(tripId);
    if (found === 'error') {
      await notice('보고서를 열지 못했어요', '보고서가 이미 있는지 확인하지 못했어요. 잠시 뒤 다시 해 주세요.');
      return false;
    }
    if (found) {
      const detail = await useReportStore.getState().loadDetail(found);
      const draft = detail ? reportStateNow(found).stage === 'draft' : false;
      router.push((draft ? reportEditHref(found, 'create') : reportDetailHref(found)) as never);
      // 목록에 없던 보고서였을 수 있다 — 이동과 같은 틱에 store 를 바꾸지 않고 다음 프레임에 받는다.
      requestAnimationFrame(() => void useReportStore.getState().refresh());
      return true;
    }

    // 방문 캐시는 다른 화면(현장 상세 등)이 일부만 채워 두었을 수 있다 — 늘 외근 상세를 받은 뒤 만든다.
    await useTripStore.getState().loadDetail(tripId);
    if (useTripStore.getState().detailStatus[tripId] !== 'success') {
      await notice('보고서를 만들지 못했어요', '외근 기록을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.');
      return false;
    }
    const trip = useTripStore.getState().trips.find((t) => t.id === tripId);
    const title = trip ? `${tripTitle(trip)} 보고` : '외근 보고';
    const r = await useReportStore.getState().createWithVisitScaffold({ title, tripId }, scaffoldItems(tripId));
    if (!r.ok) {
      await notice('보고서를 만들지 못했어요', r.error);
      return false;
    }
    // 빠진 현장 수는 9-2 가 열린 뒤 안내한다(?failed).
    router.push(reportEditHref(r.report.id, 'create', r.failedFieldIds.length) as never);
    return true;
  } finally {
    openingTrips.delete(tripId);
  }
}

/**
 * 9-13 보고서 삭제 — 확인 창 → 삭제 → 기기에 남긴 작성 완료 표시도 지운다. 이미 지워진 보고서(404)도 지운 것으로 본다(reportStore).
 * 같은 보고서로 확인·삭제 중에 다시 누르면 무시한다. 지웠으면 true.
 */
const deletingReports = new Set<string>();
export async function confirmDeleteReport(reportId: string, onStart?: () => void): Promise<boolean> {
  if (deletingReports.has(reportId)) return false;
  deletingReports.add(reportId);
  try {
    const ok = await confirm({
      title: '보고서를 삭제할까요?',
      message: '외근 기록은 그대로 남아요.',
      confirmLabel: '삭제',
      destructive: true,
    });
    if (!ok) return false;
    onStart?.();
    const r = await useReportStore.getState().remove(reportId);
    if (!r.ok) {
      await notice('보고서를 삭제하지 못했어요', r.error);
      return false;
    }
    useReportCompletionStore.getState().forget(reportId);
    return true;
  } finally {
    deletingReports.delete(reportId);
  }
}
