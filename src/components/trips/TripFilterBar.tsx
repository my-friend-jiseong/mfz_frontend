import {
  FilterAccordion,
  FilterOptionRow,
  FilterDateRange,
  dateRangeSummary,
  type FilterGroup,
} from '@/components/ui/FilterAccordion';

// 외근 내역 필터 — 기간(시작일 기준) + 보고 여부.
// 껍데기는 FilterAccordion 공용 부품, 여기는 그룹 정의만 (FieldFilterBar 와 같은 구조).
//
// 기간은 프리셋(오늘/이번 주)이 아니라 **날짜 범위**다 — 현장 목록과 조작법을 맞춘다.
// 보고 여부는 카드에 이미 있는 '보고서' 배지와 같은 판정(Report.tripId)을 쓴다.
//
// 두 그룹 모두 클라이언트 필터다. GET /api/trips 는 page·limit 외 필터 파라미터가 없고,
// 목록은 이미 로컬에 전부 있다.

/** null = 전체 */
export type TripReportFilter = 'reported' | 'unreported' | null;

interface Props {
  fromDate: string | null;
  toDate: string | null;
  onDateRange: (from: string | null, to: string | null) => void;
  reported: TripReportFilter;
  onReported: (v: TripReportFilter) => void;
  onResetAll: () => void;
  hasFilter: boolean;
}

const REPORT_LABEL: Record<'reported' | 'unreported', string> = {
  reported: '보고서 작성됨',
  unreported: '보고서 없음',
};

export function TripFilterBar({
  fromDate,
  toDate,
  onDateRange,
  reported,
  onReported,
  onResetAll,
  hasFilter,
}: Props) {
  const groups: FilterGroup[] = [
    {
      key: 'date',
      base: '기간',
      value: dateRangeSummary(fromDate, toDate),
      render: () => (
        <FilterDateRange
          fromDate={fromDate}
          toDate={toDate}
          onChange={onDateRange}
          fromLabel="시작"
          toLabel="종료"
        />
      ),
    },
    {
      key: 'report',
      base: '보고 여부',
      value: reported ? REPORT_LABEL[reported] : null,
      render: () => (
        <>
          <FilterOptionRow
            label="전체"
            selected={reported === null}
            onPress={() => onReported(null)}
          />
          <FilterOptionRow
            label={REPORT_LABEL.reported}
            selected={reported === 'reported'}
            onPress={() => onReported('reported')}
          />
          <FilterOptionRow
            label={REPORT_LABEL.unreported}
            selected={reported === 'unreported'}
            onPress={() => onReported('unreported')}
          />
        </>
      ),
    },
  ];

  return (
    <FilterAccordion groups={groups} hasFilter={hasFilter} onResetAll={onResetAll} />
  );
}
