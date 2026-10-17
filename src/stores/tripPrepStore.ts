import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 외근 전에 담은 목적지(4 현장 검색의 '+', 5 현장 상세의 [외근 목적지에 추가], 6 외근 준비의 '+').
// 6 외근 준비가 이 목록을 보여 주고, [출발](tripStore.start) 하면 비운다.
// 서버에 저장할지는 정하지 않았다(인수인계 §4 확인 필요) — 지금은 기기에만 둔다.

const STORAGE_KEY = 'mfz.tripPrep.v1';

interface TripPrepState {
  fieldIds: string[];
  hydrated: boolean;
  /** 저장본을 읽는다. 여러 곳이 불러도 한 번만 읽고, 끝날 때까지 기다릴 수 있다. */
  hydrate: () => Promise<void>;
  add: (fieldIds: string[]) => void;
  remove: (fieldId: string) => void;
  /** 순서를 바꾼다(6 가까운 순으로·꾹 눌러 끌기). */
  setOrder: (fieldIds: string[]) => void;
  clear: () => void;
}

// clear 할 때마다 늘린다 — 하이드레이트가 비운 뒤에 끝나면(로그아웃·출발 직후) 옛 목록을 되살리지 않게.
let generation = 0;
let hydrateInflight: Promise<void> | null = null;

function persist(ids: string[]) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids)).catch(() => {});
}

export const useTripPrepStore = create<TripPrepState>((set, get) => {
  const hydrateOnce = async () => {
    const gen = generation;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (gen !== generation) return;
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      if (Array.isArray(parsed)) {
        // 하이드레이트 전에 담은 것은 뒤에 붙인다.
        const pre = get().fieldIds;
        const merged = [...new Set([...parsed.filter((x): x is string => typeof x === 'string'), ...pre])];
        set({ fieldIds: merged });
        // 그사이 add 가 저장본을 자기 목록으로 덮어썼다 — 합친 목록으로 다시 저장한다.
        if (pre.length > 0) persist(merged);
      }
    } catch {
      /* ignore */
    } finally {
      set({ hydrated: true });
    }
  };

  return {
    fieldIds: [],
    hydrated: false,

    hydrate: () => {
      if (get().hydrated) return Promise.resolve();
      if (!hydrateInflight) {
        hydrateInflight = hydrateOnce().finally(() => {
          hydrateInflight = null;
        });
      }
      return hydrateInflight;
    },

    add: (ids) => {
      const next = [...new Set([...get().fieldIds, ...ids])];
      set({ fieldIds: next });
      persist(next);
    },

    remove: (fieldId) => {
      const next = get().fieldIds.filter((id) => id !== fieldId);
      set({ fieldIds: next });
      persist(next);
    },

    setOrder: (ids) => {
      set({ fieldIds: ids });
      persist(ids);
    },

    clear: () => {
      generation++;
      set({ fieldIds: [] });
      persist([]);
    },
  };
});
