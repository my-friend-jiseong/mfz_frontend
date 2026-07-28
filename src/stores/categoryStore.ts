import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Category } from '@/types/entities';
import { categories as categoriesApi, localizeError, errorCode } from '@/api';
import type { CategoryItem } from '@/api';

// 사용자 커스텀 카테고리(분류) 마스터. (backend-backlog §25 — release 2026-07-26 배포 완료)
//
// **서버가 진실원이다.** AsyncStorage 는 오프라인 표시용 캐시로만 남는다.
// 단 백엔드 배포 전에 로컬에서 만든 항목(id 가 `cat-` 접두)이 있을 수 있어, 서버 목록을
// 채택하기 전에 **최초 1회 flush** 로 밀어 올린다. 이 단계가 없으면 첫 실행에서 로컬 전용
// 카테고리가 통째로 증발한다.
//
// flush 가 1회성이어야 하는 이유: 매번 돌면 사용자가 서버에서 지운 카테고리가 로컬 캐시
// 잔재 때문에 되살아난다.
//
// 현장은 카테고리 "이름"을 저장(Field.categories: string[])하므로 이 마스터는 "허용된 이름
// 목록"으로 작동한다. 이름변경/삭제는 기존 현장 값에 캐스케이드되지 않음(§25 후속, 백엔드 FK 필요).

const STORAGE_KEY = 'mfz.categories.v1';
// 로컬 전용 항목을 서버로 올린 적이 있는지 — 사용자별이 아니라 기기별 1회.
const FLUSHED_KEY = 'mfz.categories.flushed.v1';

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

type MutateResult = { ok: true } | { ok: false; error: string };

/** 로컬에서만 만들어진(서버에 없는) 항목인지. */
const isLocalId = (id: string) => id.startsWith('cat-');

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

      // ---- 최초 1회: 로컬 전용 항목을 서버로 올린다 ----
      // 서버 목록을 그냥 채택해 버리면 백엔드 배포 전에 만든 카테고리가 사라진다.
      const flushed = await AsyncStorage.getItem(FLUSHED_KEY).catch(() => null);
      if (!flushed) {
        const serverNames = new Set(res.items.map((it) => norm(it.name)));
        const orphans = get().categories.filter(
          (c) => isLocalId(c.id) && !serverNames.has(norm(c.name)),
        );
        if (orphans.length > 0) {
          // 하나라도 실패하면 플래그를 남기지 않는다 — 다음 기회에 다시 시도.
          let allOk = true;
          for (const c of orphans) {
            try {
              await categoriesApi.create({ name: c.name });
            } catch (e) {
              // 409(이름 중복)는 이미 서버에 있다는 뜻 — 성공으로 친다.
              if (errorCode(e) !== 'category_name_taken') allOk = false;
            }
          }
          if (allOk) res = await categoriesApi.list({ limit: 200 });
          else if (__DEV__) {
            console.warn('[categoryStore.refresh] 로컬 항목 flush 일부 실패 — 다음 refresh 에 재시도');
          }
          if (!allOk) {
            // 일부만 올라간 상태로 서버 목록을 채택하면 남은 로컬 항목이 사라진다.
            // 이번 회차는 서버 채택을 건너뛰고 로컬을 유지한다.
            return;
          }
        }
        await AsyncStorage.setItem(FLUSHED_KEY, '1').catch(() => {});
      }

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
    // 서버 생성이 정상 경로. 실패해도 로컬 항목은 만들어 두고(오프라인 계속 사용),
    // 다음 refresh 의 flush 가 아니라 — flush 는 1회성이므로 — 사용자가 재시도할 때 올라간다.
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
    // 로컬 전용 항목(cat-)은 서버에 없으니 로컬 변경으로 끝.
    if (isLocalId(id)) return { ok: true };
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
    if (isLocalId(id)) return { ok: true };
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
