import {
  FilterAccordion,
  FilterDateRange,
  dateRangeSummary,
  type FilterGroup,
} from '@/components/ui/FilterAccordion';

// 보고서 목록 필터 — 작성일 기간 하나.
// 껍데기는 FilterAccordion 공용 부품 (FieldFilterBar·TripFilterBar 와 같은 구조).
//
// 클라이언트 필터다. GET /api/reports 는 fromDate/toDate 를 지원하지만, 목록이 이미
// 로컬에 전부 있어 서버 왕복을 추가할 이유가 없다. 서버 페이지네이션이 실제로
// 문제가 되면 그때 파라미터로 옮긴다.

interface Props {
  fromDate: string | null;
  toDate: string | null;
  onDateRange: (from: string | null, to: string | null) => void;
  onResetAll: () => void;
  hasFilter: boolean;
}

export function ReportFilterBar({
  fromDate,
  toDate,
  onDateRange,
  onResetAll,
  hasFilter,
}: Props) {
  const groups: FilterGroup[] = [
    {
      key: 'date',
      base: '작성일',
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
  ];

  return (
    <FilterAccordion groups={groups} hasFilter={hasFilter} onResetAll={onResetAll} />
  );
}
