import { useCallback, useEffect, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import type { Report } from '@/types/entities';
import { useReportStore } from '@/stores/reportStore';
import { useReportCompletionStore } from '@/stores/reportCompletionStore';
import { reportStateOf, type TripReportState } from '@/utils/reportStage';

export type { ReportStage, TripReportState } from '@/utils/reportStage';

/** 외근 id → 그 외근으로 만든 보고서(가장 최근). Report.tripId 는 외근 없이 만든 보고서면 null. */
function reportsByTrip(reports: Report[]): Map<string, Report> {
  const m = new Map<string, Report>();
  for (const r of reports) {
    if (!r.tripId) continue;
    const prev = m.get(r.tripId);
    if (!prev || r.createdAt > prev.createdAt) m.set(r.tripId, r);
  }
  return m;
}

// === 보고서 상세 요청 줄 — 동시에 4건까지, 새로 부탁한 것(화면 위쪽·최근 외근)을 앞에 ===
// 외근 내역은 보고서 수만큼 상세를 받아야 작성 중을 가른다(백로그 '2차 개편 요청' B, 서버가 상태를 주면 없앤다).
const MAX_INFLIGHT = 4;
const inflight = new Set<string>();
let queue: string[] = [];
// 비우면 1 증가 — 비우기 전에 나간 요청의 완료가 새 줄의 자리를 셈하지 않게.
let epoch = 0;

/** 요청 줄을 비운다. 로그아웃(reportStore.clearAll → generation 증가)에서 자동으로 불린다. */
export function resetDetailQueue(): void {
  epoch += 1;
  queue = [];
  inflight.clear();
}
useReportStore.subscribe((s, prev) => {
  if (s.generation !== prev.generation) resetDetailQueue();
});

function pump() {
  while (inflight.size < MAX_INFLIGHT && queue.length > 0) {
    const id = queue.shift() as string;
    const myEpoch = epoch;
    inflight.add(id);
    void useReportStore
      .getState()
      .loadDetail(id)
      .finally(() => {
        if (myEpoch !== epoch) return;
        inflight.delete(id);
        pump();
      });
  }
}

/** 순서대로 상세를 부탁한다. retryMissing 이면 지난번에 못 받은 것도 다시. */
function requestDetails(ids: string[], retryMissing: boolean) {
  const { detailStatus } = useReportStore.getState();
  const want = ids.filter((id) => {
    const st = detailStatus[id];
    if (inflight.has(id) || st === 'success' || st === 'loading') return false;
    return st !== 'missing' || retryMissing;
  });
  if (want.length === 0) return;
  const set = new Set(want);
  queue = [...want, ...queue.filter((id) => !set.has(id))];
  pump();
}

/**
 * 외근별 보고서 상태(1·2 외근 내역). tripIdsInOrder 는 화면에 보이는 순서(최근 외근 먼저) — 그 순서로 상세를 받는다.
 */
export function useTripReportStates(tripIdsInOrder: string[]): Map<string, TripReportState> {
  const reports = useReportStore((s) => s.reports);
  // 기기에 남긴 작성 완료 표시를 읽기 전엔 checking — 완료가 잠깐 작성 중으로 보이지 않게.
  const listArrived = useReportStore((s) => s.listLoaded);
  const completionLoaded = useReportCompletionStore((s) => s.loaded);
  const listLoaded = listArrived && completionLoaded;
  const detailCache = useReportStore((s) => s.detailCache);
  const detailStatus = useReportStore((s) => s.detailStatus);
  const accepted = useReportCompletionStore((s) => s.accepted);
  const byTrip = useMemo(() => reportsByTrip(reports), [reports]);
  const orderedIds = useMemo(
    () => tripIdsInOrder.map((t) => byTrip.get(t)?.id).filter((x): x is string => !!x),
    [tripIdsInOrder, byTrip],
  );
  const key = orderedIds.join(',');

  useEffect(() => {
    if (key) requestDetails(key.split(','), false);
  }, [key]);
  // 포커스마다 못 받은 상세(missing)를 한 번 더.
  useFocusEffect(
    useCallback(() => {
      if (key) requestDetails(key.split(','), true);
    }, [key]),
  );

  return useMemo(() => {
    const out = new Map<string, TripReportState>();
    for (const t of tripIdsInOrder) {
      const r = byTrip.get(t);
      out.set(
        t,
        reportStateOf(r, r ? detailCache[r.id] : undefined, {
          listLoaded,
          detailStatus: r ? detailStatus[r.id] : undefined,
          acceptedEmpty: r ? accepted[r.id] : undefined,
        }),
      );
    }
    return out;
  }, [tripIdsInOrder, byTrip, detailCache, detailStatus, listLoaded, accepted]);
}

/** 외근 하나의 보고서 상태(3 외근 상세). */
export function useTripReportState(tripId: string): TripReportState {
  const report = useReportStore((s) => reportsByTrip(s.reports).get(tripId));
  // 기기에 남긴 작성 완료 표시를 읽기 전엔 checking — 완료가 잠깐 작성 중으로 보이지 않게.
  const listArrived = useReportStore((s) => s.listLoaded);
  const completionLoaded = useReportCompletionStore((s) => s.loaded);
  const listLoaded = listArrived && completionLoaded;
  const detail = useReportStore((s) => (report ? s.detailCache[report.id] : undefined));
  const status = useReportStore((s) => (report ? s.detailStatus[report.id] : undefined));
  const acceptedEmpty = useReportCompletionStore((s) => (report ? s.accepted[report.id] : undefined));
  const reportId = report?.id;
  // 외근 상세로 바로 들어오면(딥 링크·새로고침) 보고서 목록을 아직 안 받았다 — 포커스마다 확인.
  useFocusEffect(
    useCallback(() => {
      const st = useReportStore.getState();
      if (!st.listLoaded && st.listStatus !== 'loading') void st.hydrate();
    }, []),
  );
  useFocusEffect(
    useCallback(() => {
      if (reportId) requestDetails([reportId], true);
    }, [reportId]),
  );
  return useMemo(
    () => reportStateOf(report, detail, { listLoaded, detailStatus: status, acceptedEmpty }),
    [report, detail, listLoaded, status, acceptedEmpty],
  );
}

/**
 * 보고서별 상태(9 보고서 목록). reportIdsInOrder 는 화면에 보이는 순서 — 그 순서로 상세를 받는다.
 * 목록 응답엔 현장 보고가 없어 상세가 와야 작성 중·완료를 가른다(그 전엔 checking).
 */
export function useReportStates(reportIdsInOrder: string[]): Map<string, TripReportState> {
  const reports = useReportStore((s) => s.reports);
  // 기기에 남긴 작성 완료 표시를 읽기 전엔 checking — 완료가 잠깐 작성 중으로 보이지 않게.
  const listArrived = useReportStore((s) => s.listLoaded);
  const completionLoaded = useReportCompletionStore((s) => s.loaded);
  const listLoaded = listArrived && completionLoaded;
  const detailCache = useReportStore((s) => s.detailCache);
  const detailStatus = useReportStore((s) => s.detailStatus);
  const accepted = useReportCompletionStore((s) => s.accepted);
  const key = reportIdsInOrder.join(',');

  useEffect(() => {
    if (key) requestDetails(key.split(','), false);
  }, [key]);
  useFocusEffect(
    useCallback(() => {
      if (key) requestDetails(key.split(','), true);
    }, [key]),
  );

  return useMemo(() => {
    const byId = new Map(reports.map((r) => [r.id, r]));
    const out = new Map<string, TripReportState>();
    for (const id of reportIdsInOrder) {
      out.set(
        id,
        reportStateOf(byId.get(id), detailCache[id], {
          listLoaded,
          detailStatus: detailStatus[id],
          acceptedEmpty: accepted[id],
        }),
      );
    }
    return out;
  }, [reportIdsInOrder, reports, detailCache, detailStatus, listLoaded, accepted]);
}

/** 상세를 이미 받은 보고서 하나의 상태 — 외근 상세·보고서 작성 진입 판단용(훅 밖). */
export function reportStateNow(reportId: string): TripReportState {
  const st = useReportStore.getState();
  const report = st.getById(reportId);
  return reportStateOf(report, st.detailCache[reportId], {
    listLoaded: true,
    detailStatus: st.detailStatus[reportId],
    acceptedEmpty: useReportCompletionStore.getState().accepted[reportId],
  });
}
