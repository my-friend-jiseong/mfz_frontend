import type { Field, FieldStatus } from '@/types/entities';

// fields/index 와 trips/new/select 양쪽이 동일한 필터·검색 로직을 갖고 있어 추출.
// projects/categories 모집은 first-seen 기준 — 같은 projectId 가 여러 fields 에 있을 때
// 첫 등장의 projectName 을 라벨로 사용. 사용 안 된 프로젝트는 chip 으로 노출하지 않음.

// 현장의 논리적 '제목' — name(건물·장소명) 우선, 없으면 address.
// 목록 검색과 카드 제목이 이 한 셀렉터를 공유해 "보이는 제목 = 검색 대상" 을 보장.
export function fieldTitle(f: Pick<Field, 'name' | 'address'>): string {
  return f.name?.trim() || f.address;
}

export interface FieldFacets {
  projects: Array<{ id: string; name: string }>;
  categories: string[];
}

// 카테고리 필터·표시 후보 = 마스터 집합(categoryStore) ∪ 기존 현장 값(레거시 보존).
// 마스터에 아직 없지만 과거 현장에 남은 이름도 계속 필터/표시되도록 union 후 정렬.
export function mergeCategoryNames(
  master: readonly string[],
  fromFields: readonly string[],
): string[] {
  return Array.from(new Set([...master, ...fromFields])).sort((a, b) =>
    a.localeCompare(b),
  );
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

// 필터 적용 — status → project → category(OR) → search 순.
// search 는 제목만 매칭 — 전 자원 '제목 검색' 통일(2026-07-24). 현장 제목 = fieldTitle().
// 이전엔 address+detail+project+category 까지 뒤졌으나 자원 간 검색 일관성 위해 제목으로 축소.
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
    list = list.filter((f) => fieldTitle(f).toLowerCase().includes(q));
  }
  return list as Field[];
}
