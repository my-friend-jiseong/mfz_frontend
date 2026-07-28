import { StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import {
  FilterAccordion,
  FilterOptionRow,
  FilterDateRange,
  dateRangeSummary,
  type FilterGroup,
} from '@/components/ui/FilterAccordion';
import {
  FIELD_STATUS_VALUES,
  FIELD_STATUS_LABEL,
  type FieldStatus,
} from '@/types/entities';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

// 현장 목록 필터 — 4개 그룹(조치상태·프로젝트·카테고리·방문일).
// 껍데기(칩 줄·패널·옵션행·날짜 범위)는 FilterAccordion 공용 부품이 담당하고,
// 여기는 "어떤 그룹이 있고 무엇을 고르는가" 만 정의한다.
// status·방문일은 서버 refresh, project·category 는 클라 필터.

interface Props {
  status: FieldStatus | null;
  onStatus: (s: FieldStatus | null) => void;
  projects: ReadonlyArray<{ id: string; name: string }>;
  projectId: string | null;
  onProject: (id: string | null) => void;
  categories: readonly string[];
  category: string | null;
  onCategory: (c: string | null) => void;
  fromDate: string | null;
  toDate: string | null;
  onDateRange: (from: string | null, to: string | null) => void;
  onResetAll: () => void;
  hasFilter: boolean;
  // 방문일 그룹 노출 여부. 현장 목록은 서버 refresh 로 기간을 거르지만, 외근 시작
  // 현장 선택은 클라이언트 필터(applyFieldFilters)만 쓰므로 동작하지 않는 그룹을 숨긴다.
  showDate?: boolean;
}

export function FieldFilterBar({
  status,
  onStatus,
  projects,
  projectId,
  onProject,
  categories,
  category,
  onCategory,
  fromDate,
  toDate,
  onDateRange,
  onResetAll,
  hasFilter,
  showDate = true,
}: Props) {
  const projectName = projectId
    ? projects.find((p) => p.id === projectId)?.name ?? '프로젝트'
    : null;

  const groups: FilterGroup[] = [
    {
      key: 'status',
      base: '조치상태',
      value: status ? FIELD_STATUS_LABEL[status] : null,
      render: () => (
        <>
          <FilterOptionRow
            label="전체"
            selected={status === null}
            onPress={() => onStatus(null)}
          />
          {FIELD_STATUS_VALUES.map((s) => (
            <FilterOptionRow
              key={s}
              label={FIELD_STATUS_LABEL[s]}
              dotColor={colors.fieldStatus[s]}
              selected={status === s}
              onPress={() => onStatus(s)}
            />
          ))}
        </>
      ),
    },
    {
      key: 'project',
      base: '프로젝트',
      value: projectName,
      render: () => (
        <>
          <FilterOptionRow
            label="전체"
            selected={projectId === null}
            onPress={() => onProject(null)}
          />
          {projects.length === 0 ? (
            <Text variant="caption" color="textMuted" style={styles.empty}>
              소속된 프로젝트가 없습니다
            </Text>
          ) : (
            projects.map((p) => (
              <FilterOptionRow
                key={p.id}
                label={p.name}
                selected={projectId === p.id}
                onPress={() => onProject(p.id)}
              />
            ))
          )}
        </>
      ),
    },
    {
      key: 'category',
      base: '카테고리',
      value: category,
      render: () => (
        <>
          <FilterOptionRow
            label="전체"
            selected={category === null}
            onPress={() => onCategory(null)}
          />
          {categories.length === 0 ? (
            <Text variant="caption" color="textMuted" style={styles.empty}>
              분류가 없습니다
            </Text>
          ) : (
            categories.map((c) => (
              <FilterOptionRow
                key={c}
                label={c}
                selected={category === c}
                onPress={() => onCategory(c)}
              />
            ))
          )}
        </>
      ),
    },
    ...(showDate
      ? [
          {
            key: 'date',
            base: '방문일',
            value: dateRangeSummary(fromDate, toDate),
            render: () => (
              <FilterDateRange
                fromDate={fromDate}
                toDate={toDate}
                onChange={onDateRange}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <FilterAccordion groups={groups} hasFilter={hasFilter} onResetAll={onResetAll} />
  );
}

const styles = StyleSheet.create({
  empty: { paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
});
