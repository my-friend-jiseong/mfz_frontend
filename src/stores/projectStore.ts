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
  getById: (id: string) => Project | undefined;
}

const describeError = localizeError;

function toProject(it: ProjectItem): Project {
  return {
    id: it.id,
    userId: it.userId ?? '',
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
      set({ projects: res.items.map(toProject) });
    } catch (e) {
      if (__DEV__) console.error('[projectStore.refresh] failed', e);
    }
  },

  create: async (body) => {
    set({ busy: true });
    try {
      const res = await projectsApi.create(body);
      const p = toProject(res);
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

  getById: (id) => get().projects.find((p) => p.id === id),
}));
