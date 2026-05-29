import { create } from 'zustand';
import type { Project } from '@/types/entities';
import { projects as projectsApi, localizeError } from '@/api';
import type { CreateProjectBody, ProjectItem } from '@/api';

// ERD v2 신규 — 사용자별 프로젝트. 현장 생성/수정 시 소속 프로젝트 선택에 사용.

type CreateResult =
  | { ok: true; project: Project }
  | { ok: false; error: string };

interface ProjectState {
  projects: Project[];
  busy: boolean;

  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  create: (body: CreateProjectBody) => Promise<CreateResult>;
  clearAll: () => void;
  getById: (id: string) => Project | undefined;
}

const describeError = localizeError;

// id 가 응답에서 누락된 항목은 toProject 가 null 반환 — 빈 id 의 Project 가
// getById('') 매칭이나 filter 회로에 흡수되는 케이스 차단.
function toProject(it: ProjectItem): Project | null {
  const id = it.projectId ?? it.id;
  if (!id) return null;
  return {
    id,
    userId: '', // 응답에 userId 없음 — 본인 목록
    name: it.name,
    status: it.status,
    createdAt: it.createdAt,
    updatedAt: it.updatedAt,
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  busy: false,

  hydrate: async () => {
    await get().refresh();
  },

  refresh: async () => {
    try {
      const res = await projectsApi.list({ limit: 100 });
      const items = res.items
        .map(toProject)
        .filter((p): p is Project => p !== null);
      set({ projects: items });
    } catch (e) {
      if (__DEV__) console.error('[projectStore.refresh] failed', e);
    }
  },

  create: async (body) => {
    set({ busy: true });
    try {
      const res = await projectsApi.create(body);
      const p = toProject(res);
      if (!p) {
        set({ busy: false });
        return { ok: false, error: '프로젝트 생성 응답이 올바르지 않습니다' };
      }
      set((s) => ({
        projects: [p, ...s.projects.filter((x) => x.id !== p.id)],
        busy: false,
      }));
      return { ok: true, project: p };
    } catch (e) {
      set({ busy: false });
      return { ok: false, error: describeError(e) };
    }
  },

  // 로그아웃 시 호출 — 다음 사용자의 데이터가 짧은 윈도우 동안 잔존하지 않도록.
  clearAll: () => set({ projects: [], busy: false }),

  getById: (id) => get().projects.find((p) => p.id === id),
}));
