import type { Router } from 'expo-router';
import { reports as reportsApi } from '@/api';
import { useReportStore } from '@/stores/reportStore';

/**
 * 체크인의 `보고서 작성` 분기 (명세 v2 FE-CHK-07).
 *   외근의 보고서가 없으면 → 보고서 작성
 *   있으면 → 이 현장의 현장 보고(없으면 현장 보고 추가)
 * 보고서 존재 여부는 로컬 캐시가 아니라 서버에서 확인한다 — 다른 기기에서 만든 보고서를 놓치면
 * 같은 외근에 보고서가 두 개 생긴다.
 */
export async function openReportForTripField(
  router: Router,
  tripId: string,
  fieldId: string,
): Promise<void> {
  let reportId: string | null = null;
  try {
    // tripId 쿼리를 서버가 무시하더라도 틀리지 않게 응답에서 한 번 더 거른다.
    const res = await reportsApi.list({ tripId, limit: 50 });
    reportId = res.items?.find((x) => x.tripId === tripId)?.reportId ?? null;
  } catch {
    // 조회 실패 시 작성 화면으로 보낸다 — 그 화면이 외근 선택·중복을 다시 다룬다.
  }

  if (!reportId) {
    router.push(`/(tabs)/reports/new?tripId=${encodeURIComponent(tripId)}` as never);
    return;
  }

  const report = await useReportStore.getState().loadDetail(reportId);
  if (!report) {
    // 상세를 못 받았으면 추가 화면으로 보내지 않는다 — 이미 있는 현장 보고를 중복 생성할 수 있다.
    router.push(`/(tabs)/reports/${reportId}` as never);
    return;
  }
  const fr = report.fieldReports?.find((x) => x.fieldId === fieldId);
  if (fr) {
    router.push(`/(tabs)/reports/${reportId}/field-report?frId=${fr.id}&wizard=1` as never);
  } else {
    router.push(
      `/(tabs)/reports/${reportId}/field-report?fieldId=${encodeURIComponent(fieldId)}` as never,
    );
  }
}

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
 * 외근 내역·외근 상세의 [보고서 작성]. 로컬 목록이 오래됐을 수 있어(다른 기기에서 만든 보고서) 서버에서 한 번 더
 * 확인하고, 이미 있으면 그 보고서로 보낸다 — 같은 외근에 보고서가 두 개 생기지 않게.
 * TODO(PR8): 9-2 보고서 작성으로 바꾼다.
 */
export async function openReportForTrip(router: Router, tripId: string): Promise<void> {
  const found = await findTripReportId(tripId);
  if (typeof found === 'string' && found !== 'error') {
    void useReportStore.getState().refresh();
    router.push(`/(tabs)/reports/${found}` as never);
    return;
  }
  // 조회 실패 시에도 작성 화면으로 — 그 화면이 외근 선택·중복을 다시 다룬다(openReportForTripField 와 같은 규칙).
  router.push(`/(tabs)/reports/new?tripId=${encodeURIComponent(tripId)}` as never);
}
