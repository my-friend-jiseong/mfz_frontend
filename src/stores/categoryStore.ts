import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Category } from '@/types/entities';
import { categories as categoriesApi, localizeError, errorCode } from '@/api';
import type { CategoryItem } from '@/api';

// 사용자 커스텀 카테고리(분류) 마스터. (backend-backlog §25 — release 2026-07-26 배포 완료)
//
// **서버가 진실원이다.** AsyncStorage 는 오프라인 표시용 캐시로만 남는다.
// 서버 목록을 채택하기 전에 **아직 서버에 없는 항목을 올린다**(refresh 의 (a)/(b) 참고).
// 이 단계가 없으면 오프라인 생성분과 백엔드 배포 전 만든 카테고리가 통째로 증발한다.
//
// 현장은 카테고리 "이름"을 저장(Field.categories: string[])하므로 이 마스터는 "허용된 이름
// 목록"으로 작동한다. 이름변경/삭제는 기존 현장 값에 캐스케이드되지 않음(§25 후속, 백엔드 FK 필요).

const STORAGE_KEY = 'mfz.categories.v1';
// 로컬 전용 항목을 서버로 올린 적이 있는지 — 사용자별이 아니라 기기별 1회.
const FLUSHED_KEY = 'mfz.categories.flushed.v1';

let nextSeq = 1;
// `cat-` 를 쓰지 않는다 — 백엔드 categoryId 가 `cat-<epoch>-<hex>` 라 겹친다.
// 판정은 어차피 아래 local 플래그로 하지만, 로그에서 눈으로 구분되게 접두도 분리.
function nextLocalId(): string {
  return `localcat-${Date.now().toString(36)}-${nextSeq++}`;
}

function serverToCategory(it: CategoryItem): Category | null {
  const id = it.categoryId ?? it.id;
  if (!id) return null;
  return { id, name: it.name, createdAt: it.createdAt };
}

function sortByName(list: Category[]): Category[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name));
}

async function persist(list: Category[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 저장 실패해도 앱 동작 계속 — 다음 부팅 시 메모리 상태로만 유지.
  }
}

type CreateResult =
  | { ok: true; category: Category }
  | { ok: false; error: string };

type MutateResult = { ok: true } | { ok: false; error: string };

// 로컬에서만 만들어진(서버에 없는) 항목인지 — **명시 플래그로만** 판정한다.
// id 접두(`cat-`)로 추론하던 이전 방식은 백엔드 categoryId 와 형식이 겹쳐
// 서버 항목을 전부 로컬로 오인했고, 그래서 rename/remove 가 서버에 가지 않았다
// (실측 2026-07-28: 이름 변경 후 새로고침하면 옛 이름으로 되돌아감).
const isLocal = (c: Category) => c.local === true;

interface CategoryState {
  categories: Category[];
  busy: boolean;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  create: (name: string) => Promise<CreateResult>;
  rename: (id: string, name: string) => Promise<MutateResult>;
  remove: (id: string) => Promise<MutateResult>;
  // 기존 현장 카테고리 이름들로 마스터를 최초 채움(무손실 마이그레이션). 이미 있는 이름은 건너뜀.
  // 서버가 진실원이 된 뒤로는 **서버에 생성**해야 한다 — 로컬로만 채우면 다음 refresh 에 지워진다.
  seed: (names: readonly string[]) => Promise<void>;
  getByName: (name: string) => Category | undefined;
  clearAll: () => Promise<void>;
}

// 이름 동일성 — trim + 소문자 비교(표기 흔들림 흡수).
const norm = (s: string) => s.trim().toLowerCase();

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  busy: false,
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Category[];
        if (Array.isArray(parsed)) set({ categories: sortByName(parsed) });
      }
    } catch {
      /* ignore */
    } finally {
      set({ hydrated: true });
    }
  },

  refresh: async () => {
    await get().hydrate();
    try {
      let res = await categoriesApi.list({ limit: 200 });

      const serverNames = new Set(res.items.map((it) => norm(it.name)));
      const flushed = await AsyncStorage.getItem(FLUSHED_KEY).catch(() => null);

      // ---- 서버에 아직 없는 항목을 올린다 ----
      // 두 종류를 구분한다:
      //  (a) 상시 — `local` 플래그가 붙은 오프라인 생성분. 정의상 서버에 없으므로 매번 올려도
      //      "지운 카테고리가 되살아나는" 위험이 없다. 1회성으로 두면 오프라인에서 만든
      //      카테고리가 온라인 복귀 시 조용히 사라진다(실측 2026-07-28).
      //  (b) 1회성 — 이 버전 이전에 만들어져 플래그가 없는 레거시 항목. 서버 항목과 구분할
      //      단서가 이름뿐이라, 반복하면 다른 기기에서 삭제한 카테고리를 되살린다. 그래서 1회만.
      const pendingLocal = get().categories.filter(
        (c) => isLocal(c) && !serverNames.has(norm(c.name)),
      );
      const legacy = flushed
        ? []
        : get().categories.filter(
            (c) => !isLocal(c) && !serverNames.has(norm(c.name)),
          );
      const toUpload = [...pendingLocal, ...legacy];

      let allOk = true;
      for (const c of toUpload) {
        try {
          await categoriesApi.create({ name: c.name });
        } catch (e) {
          // 409(이름 중복)는 이미 서버에 있다는 뜻 — 성공으로 친다.
          if (errorCode(e) !== 'category_name_taken') allOk = false;
        }
      }
      if (!allOk) {
        // 일부만 올라간 상태로 서버 목록을 채택하면 남은 항목이 사라진다.
        // 이번 회차는 서버 채택을 건너뛰고 로컬을 유지한 뒤 다음 refresh 에 재시도.
        if (__DEV__) {
          console.warn('[categoryStore.refresh] 미동기 항목 업로드 일부 실패 — 로컬 유지');
        }
        return;
      }
      if (toUpload.length > 0) res = await categoriesApi.list({ limit: 200 });
      if (!flushed) await AsyncStorage.setItem(FLUSHED_KEY, '1').catch(() => {});

      // ---- 서버를 진실원으로 채택 ----
      const items = res.items
        .map(serverToCategory)
        .filter((c): c is Category => c !== null);
      const sorted = sortByName(items);
      set({ categories: sorted });
      void persist(sorted);
    } catch (e) {
      // 네트워크·서버 장애 — 로컬 캐시를 유지해 관리 화면·피커가 계속 동작하게 한다.
      if (__DEV__) console.warn('[categoryStore.refresh] 서버 미응답, 로컬 유지', e);
    }
  },

  create: async (rawName) => {
    const name = rawName.trim();
    if (!name) return { ok: false, error: '카테고리 이름을 입력하세요' };
    const existing = get().categories.find((c) => norm(c.name) === norm(name));
    if (existing) return { ok: true, category: existing }; // 중복은 기존 것 반환

    set({ busy: true });
    // 서버 생성이 정상 경로. 실패해도 로컬 항목(local: true)은 만들어 둔다 —
    // 오프라인에서 계속 쓰고, 다음 성공하는 refresh 가 (a) 경로로 서버에 올린다.
    let category: Category | null = null;
    try {
      category = serverToCategory(await categoriesApi.create({ name }));
    } catch (e) {
      // 409: 서버에 같은 이름이 이미 있다. 로컬 목록이 뒤처진 것뿐이므로 실패가 아니다.
      if (errorCode(e) === 'category_name_taken') {
        set({ busy: false });
        await get().refresh();
        const found = get().categories.find((c) => norm(c.name) === norm(name));
        if (found) return { ok: true, category: found };
        return { ok: false, error: '같은 이름의 카테고리가 이미 있습니다' };
      }
      if (__DEV__) console.warn('[categoryStore.create] 서버 미반영, 로컬 생성', e);
    }
    const resolved: Category = category ?? {
      id: nextLocalId(),
      name,
      createdAt: new Date().toISOString(),
      local: true,
    };
    const next = sortByName([
      resolved,
      ...get().categories.filter((c) => c.id !== resolved.id),
    ]);
    set({ categories: next, busy: false });
    void persist(next);
    return { ok: true, category: resolved };
  },

  rename: async (id, rawName) => {
    const name = rawName.trim();
    if (!name) return { ok: false, error: '카테고리 이름을 입력하세요' };
    const dup = get().categories.find(
      (c) => c.id !== id && norm(c.name) === norm(name),
    );
    if (dup) return { ok: false, error: '같은 이름의 카테고리가 이미 있습니다' };

    // 낙관적 반영 후 서버 확인. 서버가 진실원이므로 실패하면 되돌린다 —
    // 안 그러면 화면엔 바뀐 이름이, 서버엔 옛 이름이 남아 다음 refresh 에 되돌아간다.
    const before = get().categories;
    const next = sortByName(
      before.map((c) => (c.id === id ? { ...c, name } : c)),
    );
    set({ categories: next });
    void persist(next);
    // 로컬 전용 항목은 서버에 없으니 로컬 변경으로 끝.
    if (before.some((c) => c.id === id && isLocal(c))) return { ok: true };
    try {
      await categoriesApi.update(id, { name });
      return { ok: true };
    } catch (e) {
      set({ categories: before });
      void persist(before);
      return { ok: false, error: localizeError(e) };
    }
  },

  remove: async (id) => {
    const before = get().categories;
    const next = before.filter((c) => c.id !== id);
    set({ categories: next });
    void persist(next);
    if (before.some((c) => c.id === id && isLocal(c))) return { ok: true };
    try {
      await categoriesApi.remove(id);
      return { ok: true };
    } catch (e) {
      // 404(이미 없음)는 삭제 목적이 달성된 것 — 되돌리면 유령 항목이 되살아난다.
      if (errorCode(e) === 'category_not_found') return { ok: true };
      set({ categories: before });
      void persist(before);
      return { ok: false, error: localizeError(e) };
    }
  },

  seed: async (names) => {
    // 최초 부트스트랩 1회만 — 마스터가 비었을 때만 기존 현장 카테고리로 채운다.
    // 이유: 마스터가 이미 있으면 재시드하지 않아야 (a) 관리 화면에서 삭제한 카테고리가
    // 아직 그 값을 가진 현장 때문에 되살아나지 않고, (b) 반복 오염이 없다.
    // 마스터에 없는 레거시 현장 값은 필터에서 mergeCategoryNames union 으로 계속 노출됨.
    // ※ 호출부는 반드시 refresh()(=hydrate) 완료 후 호출할 것 — 아니면 하이드레이트 전
    //   빈 상태로 판단해 잘못 재시드된다.
    if (get().categories.length > 0) return;
    const have = new Set<string>();
    const fresh: string[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name || have.has(norm(name))) continue;
      have.add(norm(name));
      fresh.push(name);
    }
    if (fresh.length === 0) return;

    // 서버에 생성 — 로컬로만 채우면 곧이은 refresh 가 서버(빈 목록)를 채택하며 지워버린다.
    let serverOk = true;
    for (const name of fresh) {
      try {
        await categoriesApi.create({ name });
      } catch (e) {
        // 이미 있으면 목적 달성.
        if (errorCode(e) !== 'category_name_taken') serverOk = false;
      }
    }
    if (serverOk) {
      await get().refresh();
      return;
    }
    // 서버 실패(오프라인 등) — 로컬로라도 채워 피커·관리 화면이 동작하게 한다.
    // 이 항목들은 cat- id 라 다음 성공하는 create/refresh 시점에 정리된다.
    if (__DEV__) console.warn('[categoryStore.seed] 서버 생성 실패 — 로컬 시드로 폴백');
    const next = sortByName(
      fresh.map((name) => ({
        id: nextLocalId(),
        name,
        createdAt: new Date().toISOString(),
        local: true,
      })),
    );
    set({ categories: next });
    void persist(next);
  },

  getByName: (name) =>
    get().categories.find((c) => norm(c.name) === norm(name)),

  // 로그아웃 시 호출 — 다른 사용자가 같은 기기에서 로그인했을 때 잔존하지 않도록.
  clearAll: async () => {
    set({ categories: [], busy: false, hydrated: false });
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      // flush 플래그는 남긴다 — 로컬 캐시를 비운 뒤엔 올릴 로컬 전용 항목도 없고,
      // 다음 사용자의 서버 목록을 이 기기의 옛 항목으로 오염시킬 이유가 없다.
    } catch {
      /* ignore */
    }
  },
}));
