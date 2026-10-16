import type { Report } from '@/types/entities';
import { isFieldReportEmpty } from './fieldReport';

/**
 * 외근의 보고서 상태 3단계(인수인계 '용어·문구 규칙'): 작성 전 / 작성 중 / 작성 완료.
 * 서버 Report 에 상태 칸이 없어(백로그 '2차 개편 요청' B) 내용으로 계산한다 — 보고서가 있고
 * 빈 현장 보고(isFieldReportEmpty)가 하나라도 있으면 작성 중, 없으면 작성 완료.
 * checking: 아직 모른다(목록 또는 상세를 받는 중) — 배지도 [보고서 작성]도 그리지 않는다.
 */
export type ReportStage = 'checking' | 'none' | 'draft' | 'done';

export interface TripReportState {
  stage: ReportStage;
  report?: Report;
  /** 내용이 있는 현장 보고 수(3-1 '현장 N곳 중 M곳'). 상세를 아직 못 받았으면 null. */
  filled: number | null;
  total: number | null;
}

const CHECKING: TripReportState = { stage: 'checking', filled: null, total: null };
const NONE: TripReportState = { stage: 'none', filled: null, total: null };

/**
 * 보고서 하나의 상태. 목록 응답엔 현장 보고가 없어 상세(detail)가 있어야 작성 중을 가를 수 있다.
 * - 보고서 목록을 아직 한 번도 못 받았으면 checking(작성 전으로 보이면 같은 외근에 보고서를 또 만든다)
 * - 상세를 받는 중이면 checking(작성 완료 → 작성 중으로 바뀌어 보이지 않게)
 * - 상세를 받지 못했으면(missing) 작성 완료로 둔다 — 보고서는 있으니까(대체 동작, 다음 포커스에 다시 받는다)
 */
export function reportStateOf(
  report: Report | undefined,
  detail: Report | undefined,
  opts: { listLoaded: boolean; detailStatus?: 'loading' | 'success' | 'missing' },
): TripReportState {
  if (!opts.listLoaded) return CHECKING;
  if (!report) return NONE;
  const frs = detail?.fieldReports ?? report.fieldReports;
  if (!frs) return opts.detailStatus === 'missing' ? { stage: 'done', report, filled: null, total: null } : { ...CHECKING, report };
  const filled = frs.filter((fr) => !isFieldReportEmpty(fr)).length;
  return { stage: filled < frs.length ? 'draft' : 'done', report, filled, total: frs.length };
}
