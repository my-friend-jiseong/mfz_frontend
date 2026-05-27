import { request } from '../client';

// ERD v2 신규 — 사용자별 프로젝트. 현장이 선택적으로 소속 (fields.project_id).
//   - GET /api/projects (페이지네이션), POST /api/projects, GET /api/projects/:projectId
//   - status enum 값은 §8 확인 대상.

export interface ProjectItem {
  id: string;
  userId?: string;
  name: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProjectListResponse {
  items: ProjectItem[];
  pagination: { page: number; limit: number; total: number; hasNext: boolean };
  emptyMessage?: string | null;
}

export interface CreateProjectBody {
  name: string;
  status?: string;
}

export interface ListProjectsParams {
  page?: number;
  limit?: number;
}

export const projects = {
  list: (params?: ListProjectsParams) =>
    request<ProjectListResponse>('/api/projects', { query: params }),

  detail: (projectId: string) =>
    request<ProjectItem>(`/api/projects/${projectId}`),

  create: (body: CreateProjectBody) =>
    request<ProjectItem>('/api/projects', { method: 'POST', body }),
};
