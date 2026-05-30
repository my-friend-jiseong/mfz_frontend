import type { Field, FieldStatus } from '@/types/entities';

// fields/index 와 trips/new/select 양쪽이 동일한 필터·검색 로직을 갖고 있어 추출.
// projects/categories 모집은 first-seen 기준 — 같은 projectId 가 여러 fields 에 있을 때
// 첫 등장의 projectName 을 라벨로 사용. 사용 안 된 프로젝트는 chip 으로 노출하지 않음.

export interface FieldFacets {
  projects: Array<{ id: string; name: string }>;
  categories: string[];
}

// projectName 이 비어 있을 때 chip 라벨 — raw projectId('proj-1748...') 노출 회피.
const UNNAMED_PROJECT_LABEL = '이름 없는 프로젝트';

export function collectFieldFacets(fields: readonly Field[]): FieldFacets {
  const projectsMap = new Map<string, string>();
  const categoriesSet = new Set<string>();
  for (const f of fields) {
    if (f.projectId && !projectsMap.has(f.projectId)) {
      projectsMap.set(f.projectId, f.projectName ?? UNNAMED_PROJECT_LABEL);
    }
    for (const c of f.categories ?? []) categoriesSet.add(c);
  }
  return {
    projects: Array.from(projectsMap, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    categories: Array.from(categoriesSet).sort(),
  };
}

export interface FieldFilterParams {
  search: string;
  statuses?: FieldStatus[];
  projectIds?: string[];
  categories?: string[];
}

// 필터 적용 — status → project → category(OR) → search 순. 모든 facet 동일 의미(union).
// search 매칭: address + addressDetail + projectName + categories.
export function applyFieldFilters(
  fields: readonly Field[],
  { search, statuses, projectIds, categories }: FieldFilterParams,
): Field[] {
  let list: readonly Field[] = fields;
  if (statuses && statuses.length > 0) {
    list = list.filter((f) => statuses.includes(f.status));
  }
  if (projectIds && projectIds.length > 0) {
    const allow = new Set(projectIds);
    list = list.filter((f) => f.projectId && allow.has(f.projectId));
  }
  if (categories && categories.length > 0) {
    const allowCats = new Set(categories);
    list = list.filter((f) =>
      (f.categories ?? []).some((c) => allowCats.has(c)),
    );
  }
  const q = search.trim().toLowerCase();
  if (q) {
    list = list.filter((f) => {
      const haystack = [
        f.address,
        f.addressDetail ?? '',
        f.projectName ?? '',
        ...(f.categories ?? []),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }
  return list as Field[];
}
