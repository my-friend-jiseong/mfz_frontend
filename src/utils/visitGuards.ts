import { reports as reportsApi } from '@/api';
import { useReportStore } from '@/stores/reportStore';

/**
 * 이 방문이 보고서에 반영됐는가 (명세 v2 FE-WRAP-03·FE-VED-04 — 반영됐으면 삭제 차단).
 * 현장 보고에 visitId 가 없어(백로그 §39) "같은 외근의 보고서에 같은 현장의 현장 보고가 있다" 로
 * 근사한다. 조회가 실패하면 **차단 쪽**으로 답한다 — 보고서 사진이 가리키는 방문을 지우는 것보다
 * 한 번 더 시도하게 하는 편이 안전하다.
 */
export async function visitInReport(tripId: string, fieldId: string): Promise<boolean> {
  try {
    const res = await reportsApi.list({ tripId, limit: 50 });
    const ids = (res.items ?? []).filter((x) => x.tripId === tripId).map((x) => x.reportId);
    const reports = await Promise.all(ids.map((id) => useReportStore.getState().loadDetail(id)));
    // loadDetail 은 실패하면 null 을 준다 — 확인 못 한 보고서가 있으면 차단 쪽으로.
    if (reports.some((r) => r === null)) return true;
    return reports.some((r) => r?.fieldReports?.some((fr) => fr.fieldId === fieldId));
  } catch {
    return true;
  }
}
