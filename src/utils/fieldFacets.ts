import type { Field, FieldStatus } from '@/types/entities';

// fields/index 와 trips/new/select 양쪽이 동일한 필터·검색 로직을 갖고 있어 추출.
// projects/categories 모집은 first-seen 기준 — 같은 projectId 가 여러 fields 에 있을 때
// 첫 등장의 projectName 을 라벨로 사용. 사용 안 된 프로젝트는 chip 으로 노출하지 않음.

// 현장의 논리적 '제목' — name(건물·장소명) 우선, 없으면 address.
// 목록 검색과 카드 제목이 이 한 셀렉터를 공유해 "보이는 제목 = 검색 대상" 을 보장.
export function fieldTitle(f: Pick<Field, 'name' | 'address'>): string {
  return f.name?.trim() || f.address;
}

// 문자열 s 가 tail 로 '끝나는가' — 토큰 경계까지 본다.
// endsWith 만 쓰면 "역삼동" 이 tail "삼동" 에 걸려 상세주소가 잘못 지워진다.
const endsWithToken = (s: string, tail: string) =>
  s === tail || s.endsWith(` ${tail}`);

// 현장의 부제 = **제목에서 이미 보여준 것을 뺀 나머지 주소**.
//
// 이 함수가 없던 동안 목록 카드가 같은 내용을 두 번 찍고 있었다 (2026-07-30 실측):
//   "효원 그룹 현장" → "부산광역시 해운대구 양운로 27 중동 중동"
//   "부산 … 낙동대로550번길 37" → "부산 … 낙동대로550번길 37 지하 1층 지하 1층"
// 원인 두 가지가 겹쳤다.
//   ① 서버 `address` 가 이미 동/상세주소로 끝나는데 `addressDetail` 을 무조건 이어붙였다.
//   ② `fields/new` 는 이름 입력란이 없어 `name: selected.display`(= 주소)로 저장한다 —
//      앱에서 등록한 현장은 전부 name === address 라 제목이 부제 앞에 그대로 반복된다.
// 이전 가드는 부제가 제목과 **완전히 같을 때만** 지웠기 때문에, 상세주소가 하나라도
// 붙으면 문자열이 달라져 그대로 통과했다.
export function fieldSubtitle(
  f: Pick<Field, 'name' | 'address' | 'addressDetail'>,
  title: string,
): string | undefined {
  const address = f.address?.trim() ?? '';
  const detail = f.addressDetail?.trim() ?? '';

  // ① 주소가 이미 상세주소로 끝나면 다시 붙이지 않는다.
  const full =
    detail && !endsWithToken(address, detail)
      ? [address, detail].filter(Boolean).join(' ')
      : address || detail;

  // ② 제목이 부제의 접두사면 그만큼 잘라낸다 (제목 == 부제인 경우도 여기서 빈 문자열이 된다).
  const rest = full === title ? '' : full.startsWith(`${title} `)
    ? full.slice(title.length + 1)
    : full;

  // 남은 것이 제목 안에 이미 있으면(예: name = "주소 (건물명)") 부제는 정보를 더하지 않는다.
  if (!rest || title.includes(rest)) return undefined;
  return rest;
}

// 주소 줄과 상세주소 줄을 **따로** 그리는 목록용(QuickPhotoSheet · AddDestinationModal).
// 주소가 이미 상세주소로 끝나면 둘째 줄은 같은 말이다 — 위 ① 과 같은 규칙.
// 파라미터를 Field 로 좁히지 않는다 — 외근 화면들은 주소·상세주소를 **개별 prop** 으로 받고
// (`DestinationRow` · `CurrentDestCard` · `ReviewVisitCard`) 그쪽 타입은 optional 이다.
// 방어적으로 동작하는 게 이 함수의 일이라 null/undefined 를 그대로 받는다.
export function fieldDetailLine(f: {
  address?: string | null;
  addressDetail?: string | null;
}): string | undefined {
  const address = f.address?.trim() ?? '';
  const detail = f.addressDetail?.trim() ?? '';
  if (!detail || endsWithToken(address, detail)) return undefined;
  return detail;
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
