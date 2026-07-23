import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Category } from '@/types/entities';
import { categories as categoriesApi, localizeError } from '@/api';
import type { CategoryItem } from '@/api';

// 사용자 커스텀 카테고리(분류) 마스터.
//
// TODO(backend): /api/categories 배포 후 아래 AsyncStorage 임시 영속을 제거하고
// projectStore 처럼 서버 단일 소스로 전환한다(refresh=서버 list, create/rename/remove=서버 반영).
// 지금은 백엔드 미구현이라 서버 호출을 fire-and-forget 로 시도하되 실패/404 시
// 로컬 캐시를 진실원으로 유지해 관리 화면·피커가 데모에서 동작하게 한다.
//
// 현장은 카테고리 "이름"을 저장(Field.categories: string[])하므로 이 마스터는 "허용된 이름
// 목록"으로 작동한다. 이름변경/삭제는 기존 현장 값에 캐스케이드되지 않음(백로그).

const STORAGE_KEY = 'mfz.categories.v1';

let nextSeq = 1;
function nextLocalId(): string {
  return `cat-${Date.now().toString(36)}-${nextSeq++}`;
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

interface CategoryState {
  categories: Category[];
  busy: boolean;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  create: (name: string) => Promise<CreateResult>;
  rename: (id: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  remove: (id: string) => Promise<void>;
  // 기존 현장 카테고리 이름들로 마스터를 최초 채움(무손실 마이그레이션). 이미 있는 이름은 건너뜀.
  seed: (names: readonly string[]) => void;
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
      const res = await categoriesApi.list({ limit: 200 });
      const items = res.items
        .map(serverToCategory)
        .filter((c): c is Category => c !== null);
      // 서버가 응답하면 서버를 진실원으로 채택.
      const sorted = sortByName(items);
      set({ categories: sorted });
      void persist(sorted);
    } catch (e) {
      // 백엔드 미구현/일시 장애 — 로컬 캐시 유지.
      if (__DEV__) console.warn('[categoryStore.refresh] 서버 미응답, 로컬 유지', e);
    }
  },

  create: async (rawName) => {
    const name = rawName.trim();
    if (!name) return { ok: false, error: '카테고리 이름을 입력하세요' };
    const existing = get().categories.find((c) => norm(c.name) === norm(name));
    if (existing) return { ok: true, category: existing }; // 중복은 기존 것 반환

    set({ busy: true });
    // 낙관적 로컬 생성 — 서버는 fire-and-forget(배포 전엔 실패하지만 로컬로 동작).
    let category: Category = {
      id: nextLocalId(),
      name,
      createdAt: new Date().toISOString(),
    };
    try {
      const res = await categoriesApi.create({ name });
      const mapped = serverToCategory(res);
      if (mapped) category = mapped;
    } catch (e) {
      if (__DEV__) console.warn('[categoryStore.create] 서버 미반영, 로컬 생성', e);
    }
    const next = sortByName([
      category,
      ...get().categories.filter((c) => c.id !== category.id),
    ]);
    set({ categories: next, busy: false });
    void persist(next);
    return { ok: true, category };
  },

  rename: async (id, rawName) => {
    const name = rawName.trim();
    if (!name) return { ok: false, error: '카테고리 이름을 입력하세요' };
    const dup = get().categories.find(
      (c) => c.id !== id && norm(c.name) === norm(name),
    );
    if (dup) return { ok: false, error: '같은 이름의 카테고리가 이미 있습니다' };

    const next = sortByName(
      get().categories.map((c) => (c.id === id ? { ...c, name } : c)),
    );
    set({ categories: next });
    void persist(next);
    // 서버 반영(배포 후). 로컬 id(cat-)면 서버에 없으니 스킵.
    if (!id.startsWith('cat-')) {
      try {
        await categoriesApi.update(id, { name });
      } catch (e) {
        if (__DEV__) console.warn('[categoryStore.rename] 서버 미반영', e);
      }
    }
    return { ok: true };
  },

  remove: async (id) => {
    const next = get().categories.filter((c) => c.id !== id);
    set({ categories: next });
    void persist(next);
    if (!id.startsWith('cat-')) {
      try {
        await categoriesApi.remove(id);
      } catch (e) {
        if (__DEV__) console.warn('[categoryStore.remove] 서버 미반영', e);
      }
    }
  },

  seed: (names) => {
    const have = new Set(get().categories.map((c) => norm(c.name)));
    const additions: Category[] = [];
    for (const raw of names) {
      const name = raw.trim();
      if (!name || have.has(norm(name))) continue;
      have.add(norm(name));
      additions.push({
        id: nextLocalId(),
        name,
        createdAt: new Date().toISOString(),
      });
    }
    if (additions.length === 0) return;
    const next = sortByName([...get().categories, ...additions]);
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
    } catch {
      /* ignore */
    }
  },
}));
